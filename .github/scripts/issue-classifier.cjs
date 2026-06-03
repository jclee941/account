// issue-classifier.js — deterministic, dependency-free issue classification.
//
// Why this exists
// ---------------
// `.github/workflows/91_issue-classification.yml` runs this module inside
// `actions/github-script@v9` to decide how to handle GitHub issues:
//   * duplicate detection  — compare a new issue against existing open issues
//                            with a token-Jaccard similarity (no embeddings,
//                            no vector DB, no network — must run offline in CI).
//   * resolved detection   — issues closed-by a merged PR (Closes/Fixes/Resolves
//                            keyword or `issue-N` branch), or issues whose text
//                            carries an explicit "fixed/resolved" signal.
//
// This module is PURE: it never calls the GitHub API. It only computes a plan
// (which labels to add, what comment to post, whether to close). The workflow
// performs the side effects. That keeps the logic unit-testable via Node
// (see scripts/issue_classifier_js_test.py) without mocking the API.
//
// All comments emitted carry a stable HTML marker so the workflow can avoid
// posting duplicates on re-runs / edits.

'use strict';

// Markers let the workflow find its own previous comments and stay idempotent.
const DUP_MARKER = '<!-- issue-classification:duplicate -->';
const RESOLVED_MARKER = '<!-- issue-classification:resolved -->';

// Default thresholds / toggles. Conservative by design: we never auto-close a
// duplicate, and we only auto-close resolved issues when a merged PR explicitly
// references them. Everything is overridable via config (workflow inputs/env).
const DEFAULT_CONFIG = {
  duplicateThreshold: 0.58,        // min score to flag as a possible duplicate
  duplicateCloseThreshold: 0.86,   // min score required before a close is allowed
  closeDuplicates: false,          // auto-close duplicates at all
  maxDuplicateMatches: 3,          // cap links posted in the comment
  closeResolvedByPr: true,         // close issues a merged PR says it resolves
  closeResolvedBySignal: false,    // close issues with only a text "fixed" signal
  maxCandidates: 100,              // cap candidates scanned for duplicates
  dryRun: false,                   // compute the plan but mark it a no-op
};

// Stopwords are dropped before similarity so boilerplate ("the", "a", "to")
// does not inflate the overlap between unrelated issues.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'is',
  'are', 'was', 'were', 'be', 'been', 'this', 'that', 'it', 'as', 'at', 'by',
  'from', 'i', 'we', 'you', 'my', 'me', 'so', 'if', 'no', 'not', 'do', 'does',
  'did', 'has', 'have', 'had', 'but', 'when', 'then', 'there', 'here', 'out',
  'up', 'about', 'into', 'over', 'after', 'before', 'please', 'would', 'could',
  'should', 'can', 'will', 'just', 'also', 'any', 'all', 'some', 'more',
]);

// Closing keywords GitHub itself honours, plus our `issue-N` branch convention.
const CLOSING_KEYWORDS = [
  'close', 'closes', 'closed',
  'fix', 'fixes', 'fixed',
  'resolve', 'resolves', 'resolved',
];

// Phrases that signal an issue is effectively resolved. Deliberately specific
// to avoid false positives — a lone "done" or "fix" must NOT trigger this.
const RESOLVED_SIGNALS = [
  'this is now fixed',
  'now fixed',
  'is fixed',
  'has been fixed',
  'no longer reproduces',
  'no longer reproducible',
  'no longer an issue',
  'works now',
  'is resolved',
  'has been resolved',
  'now resolved',
  // Note: concrete "fixed/resolved in v2 | #123 | release | version | pr | commit"
  // references are matched by a regex in hasResolvedSignal(), NOT by broad
  // phrases here — a bare "resolved in" would false-match "resolved in v2?".
];

// Phrases that explicitly negate a resolved signal ("not resolved", "still
// happening"). If any are present we never flag the issue as resolved.
const NEGATIONS = [
  'not fixed',
  'not resolved',
  'still happening',
  'still occurs',
  'still reproduces',
  'still get',
  'still getting',
  'still broken',
  'is not resolved',
  "isn't fixed",
  "isn't resolved",
  'unresolved',
  'should be fixed',
  'needs to be fixed',
  'to be fixed',
  'be fixed in',
  'can this be fixed',
  'will be fixed',
  'fixed in a future',
  'fixed in future',
  'should be resolved',
  'needs to be resolved',
  'to be resolved',
  'be resolved in',
  'can this be resolved',
  'will be resolved',
  'resolved in a future',
  'resolved in future',
];

function normalizeText(text) {
  if (text === null || text === undefined) return '';
  let s = String(text).toLowerCase();
  s = s.replace(/```[\s\S]*?```/g, ' ');   // drop fenced code blocks
  s = s.replace(/`[^`]*`/g, ' ');          // drop inline code
  s = s.replace(/https?:\/\/\S+/g, ' ');   // drop URLs
  s = s.replace(/[^a-z0-9\s]/g, ' ');      // punctuation -> space
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function tokenize(text) {
  const norm = normalizeText(text);
  if (!norm) return new Set();
  const out = new Set();
  for (const tok of norm.split(' ')) {
    if (tok.length < 2) continue;          // single chars carry no signal
    if (STOPWORDS.has(tok)) continue;
    out.add(tok);
  }
  return out;
}

function jaccardSimilarity(aTokens, bTokens) {
  const a = aTokens instanceof Set ? aTokens : new Set(aTokens);
  const b = bTokens instanceof Set ? bTokens : new Set(bTokens);
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const t of small) if (large.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Combine title and body similarity. Titles are weighted more heavily because
// they are the most reliable signal of "same problem".
function scoreIssueSimilarity(target, candidate) {
  const titleScore = jaccardSimilarity(
    tokenize(target.title),
    tokenize(candidate.title),
  );
  const bodyScore = jaccardSimilarity(
    tokenize(target.body),
    tokenize(candidate.body),
  );
  return 0.65 * titleScore + 0.35 * bodyScore;
}

function isPullRequest(issue) {
  // GitHub's issues API returns PRs too; they carry a `pull_request` key.
  return Boolean(issue && issue.pull_request);
}

function isOpen(issue) {
  // Treat a missing state as open (issue payloads on `opened` omit nothing,
  // but list responses always include it).
  return !issue || issue.state === undefined || issue.state === 'open';
}

// Minimum corroborating evidence before a pair may be called a duplicate.
// Guards against generic titles ("Build failed", "Crash") matching on the title
// alone with unrelated bodies. Requires EITHER body overlap, OR a strong title
// match backed by several shared meaningful tokens.
function hasDuplicateEvidence(target, candidate) {
  const tTitle = tokenize(target.title);
  const cTitle = tokenize(candidate.title);
  const titleScore = jaccardSimilarity(tTitle, cTitle);
  const bodyScore = jaccardSimilarity(tokenize(target.body), tokenize(candidate.body));
  let titleInter = 0;
  for (const t of tTitle) if (cTitle.has(t)) titleInter += 1;
  // Body corroborates similarity — trust it.
  if (bodyScore >= 0.2) return true;
  // Title-only match: require a strong title overlap AND at least minimal body
  // corroboration (bodyScore > 0), OR a long shared-title signal (>= 5 tokens).
  // This blocks short exact generic titles ("build failed again") whose bodies
  // share nothing, while still catching genuinely-similar issues.
  if (titleScore >= 0.6 && titleInter >= 3 && bodyScore > 0) return true;
  return titleScore >= 0.6 && titleInter >= 5;
}

// Rank existing issues by similarity to `target`. Skips PRs, closed issues, and
// the target itself. Returns up to `maxDuplicateMatches` entries above threshold.
function findDuplicateCandidates(target, candidates, config = DEFAULT_CONFIG) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const scored = [];
  let scanned = 0;
  for (const cand of candidates || []) {
    if (isPullRequest(cand)) continue;
    if (!isOpen(cand)) continue;
    if (cand.number === target.number) continue;
    if (scanned >= cfg.maxCandidates) break;
    scanned += 1;
    const score = scoreIssueSimilarity(target, cand);
    if (score >= cfg.duplicateThreshold && hasDuplicateEvidence(target, cand)) {
      scored.push({ number: cand.number, title: cand.title, score: round2(score) });
    }
  }
  scored.sort((x, y) => (y.score - x.score) || (x.number - y.number));
  return scored.slice(0, cfg.maxDuplicateMatches);
}

// Build the duplicate-classification plan (no side effects).
function classifyDuplicate(target, candidates, config = DEFAULT_CONFIG) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const matches = findDuplicateCandidates(target, candidates, cfg);
  if (matches.length === 0) {
    return { matches: [], label: null, comment: null, shouldClose: false, dryRun: cfg.dryRun };
  }
  const top = matches[0];
  const shouldClose =
    !cfg.dryRun && cfg.closeDuplicates && top.score >= cfg.duplicateCloseThreshold;
  return {
    matches,
    label: 'duplicate',
    comment: buildDuplicateComment(matches, cfg),
    shouldClose,
    dryRun: cfg.dryRun,
  };
}

// Pull issue numbers a PR closes: keyword references in title/body plus the
// `issue-N` branch convention. De-duplicated, sorted ascending.
function extractLinkedIssueNumbers(text, branchName) {
  const found = new Set();
  const haystack = String(text || '');
  const kw = CLOSING_KEYWORDS.join('|');
  const re = new RegExp(`\\b(?:${kw})\\b[:\\s]+#(\\d+)`, 'gi');
  let m;
  while ((m = re.exec(haystack)) !== null) {
    found.add(parseInt(m[1], 10));
  }
  if (branchName) {
    const bm = String(branchName).match(/issue[-_/]?(\d+)/i);
    if (bm) found.add(parseInt(bm[1], 10));
  }
  return [...found].sort((a, b) => a - b);
}

function containsAny(haystack, phrases) {
  const norm = normalizeText(haystack);
  return phrases.some((p) => norm.includes(normalizeText(p)));
}

// Detect an explicit "this is resolved" signal in an issue/comment, guarding
// against negations so "still not fixed" never counts as resolved.
function hasResolvedSignal(issueOrComment) {
  const text = `${issueOrComment.title || ''} ${issueOrComment.body || ''}`;
  if (containsAny(text, NEGATIONS)) return false;
  if (containsAny(text, RESOLVED_SIGNALS)) return true;
  // "fixed in v2", "fixed in #123", "resolved in 1.2.0", "fixed in release 3"
  // — a *concrete* fix reference, not a future-tense ask. normalizeText strips
  // the '#'/'.', so match against the raw lowercased text instead.
  const raw = String(text).toLowerCase();
  return /\b(?:fixed|resolved)\s+in\s+(?:#?\d|v\d|release\b|version\b|pr\b|commit\b)/.test(raw);
}

// Plan for a merged PR that references issues.
function classifyResolvedByPr(pr, config = DEFAULT_CONFIG) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const branch = (pr.head && pr.head.ref) || pr.headRefName || '';
  const issueNumbers = extractLinkedIssueNumbers(
    `${pr.title || ''}\n${pr.body || ''}`,
    branch,
  );
  if (issueNumbers.length === 0) {
    return { issueNumbers: [], label: null, comment: null, shouldClose: false, dryRun: cfg.dryRun };
  }
  return {
    issueNumbers,
    label: 'resolved',
    comment: buildResolvedComment(`merged pull request #${pr.number}`),
    shouldClose: !cfg.dryRun && cfg.closeResolvedByPr,
    dryRun: cfg.dryRun,
  };
}

// Plan for an issue/comment carrying a text resolved-signal.
function classifyResolvedBySignal(issue, config = DEFAULT_CONFIG) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  if (!hasResolvedSignal(issue)) {
    return { label: null, comment: null, shouldClose: false, dryRun: cfg.dryRun };
  }
  return {
    label: 'resolved',
    comment: buildResolvedComment('an explicit resolved/fixed signal in the issue thread'),
    shouldClose: !cfg.dryRun && cfg.closeResolvedBySignal,
    dryRun: cfg.dryRun,
  };
}

function buildDuplicateComment(matches, config = DEFAULT_CONFIG) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const links = matches
    .slice(0, cfg.maxDuplicateMatches)
    .map((m) => `- #${m.number} (similarity ${m.score})`)
    .join('\n');
  const lead = matches.length === 1
    ? `This issue looks like a possible duplicate of #${matches[0].number}.`
    : 'This issue looks like a possible duplicate of:';
  return (
    `${DUP_MARKER}\n` +
    `🔁 **Possible duplicate detected**\n\n` +
    `${lead}\n\n${links}\n\n` +
    `If this is *not* a duplicate, remove the \`duplicate\` label. ` +
    `Auto-classified by the issue-classification workflow.`
  );
}

function buildResolvedComment(reason) {
  return (
    `${RESOLVED_MARKER}\n` +
    `✅ **Marked as resolved**\n\n` +
    `This issue appears to be resolved by ${reason}. ` +
    `If it is still occurring, reopen it or remove the \`resolved\` label. ` +
    `Auto-classified by the issue-classification workflow.`
  );
}

// Parse a flat config object (env-style strings or workflow inputs) into a
// typed config. Unknown keys are ignored; unset keys fall back to defaults.
function parseConfig(raw = {}) {
  const cfg = { ...DEFAULT_CONFIG };
  const numKeys = {
    duplicate_threshold: 'duplicateThreshold',
    duplicate_close_threshold: 'duplicateCloseThreshold',
    max_duplicate_matches: 'maxDuplicateMatches',
    max_candidates: 'maxCandidates',
  };
  const boolKeys = {
    close_duplicates: 'closeDuplicates',
    close_resolved_by_pr: 'closeResolvedByPr',
    close_resolved_by_signal: 'closeResolvedBySignal',
    dry_run: 'dryRun',
  };
  for (const [k, target] of Object.entries(numKeys)) {
    if (raw[k] !== undefined && raw[k] !== null && raw[k] !== '') {
      const v = Number(raw[k]);
      if (!Number.isNaN(v)) cfg[target] = v;
    }
  }
  for (const [k, target] of Object.entries(boolKeys)) {
    if (raw[k] !== undefined && raw[k] !== null && raw[k] !== '') {
      cfg[target] = toBool(raw[k]);
    }
  }
  return cfg;
}

function toBool(v) {
  if (typeof v === 'boolean') return v;
  return ['true', '1', 'yes', 'on'].includes(String(v).toLowerCase());
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = {
  DUP_MARKER,
  RESOLVED_MARKER,
  DEFAULT_CONFIG,
  normalizeText,
  tokenize,
  jaccardSimilarity,
  scoreIssueSimilarity,
  findDuplicateCandidates,
  classifyDuplicate,
  extractLinkedIssueNumbers,
  hasResolvedSignal,
  classifyResolvedByPr,
  classifyResolvedBySignal,
  buildDuplicateComment,
  buildResolvedComment,
  parseConfig,
};

// ---------------------------------------------------------------------------
// CLI mode — local QA + pytest harness. Reads JSON fixtures, prints a JSON plan.
//   node issue-classifier.js --mode duplicate --issue X.json --candidates Y.json
//   node issue-classifier.js --mode resolved-pr --pr P.json
//   node issue-classifier.js --mode resolved-signal --issue I.json
// ---------------------------------------------------------------------------
function parseArgv(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        args[key] = 'true';
      } else {
        args[key] = next;
        i += 1;
      }
    }
  }
  return args;
}

function readJson(path) {
  const fs = require('fs');
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function cliConfig(args) {
  return parseConfig({
    duplicate_threshold: args['duplicate-threshold'],
    duplicate_close_threshold: args['duplicate-close-threshold'],
    max_duplicate_matches: args['max-duplicate-matches'],
    max_candidates: args['max-candidates'],
    close_duplicates: args['close-duplicates'],
    close_resolved_by_pr: args['close-resolved-by-pr'],
    close_resolved_by_signal: args['close-resolved-by-signal'],
    dry_run: args['dry-run'],
  });
}

function runCli(argv) {
  const args = parseArgv(argv);
  const mode = args.mode;
  const cfg = cliConfig(args);
  let result;
  if (mode === 'duplicate') {
    const issue = readJson(args.issue);
    const candidates = readJson(args.candidates);
    result = classifyDuplicate(issue, candidates, cfg);
  } else if (mode === 'resolved-pr') {
    const pr = readJson(args.pr);
    result = classifyResolvedByPr(pr, cfg);
  } else if (mode === 'resolved-signal') {
    const issue = readJson(args.issue);
    result = classifyResolvedBySignal(issue, cfg);
  } else {
    process.stderr.write(`unknown --mode: ${mode}\n`);
    process.exit(2);
    return;
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

if (require.main === module) {
  runCli(process.argv.slice(2));
}
