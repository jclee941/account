/** @file lib/verification-pipeline.mjs
 * 3-Stage Account Verification Pipeline
 * 
 * Stage 1: Immediate (URL + page text analysis)
 * Stage 2: Delayed (5-10 min post-creation IMAP/web login test)
 * Stage 3: Batch (24hr OAuth token validation)
 */

import { spawn } from 'child_process';
import { sleep } from './cdp-utils.mjs';

export class AccountVerificationPipeline {
  constructor(options = {}) {
    this.delayedVerificationMinutes = options.delayedVerificationMinutes || 10;
    this.confidenceThreshold = options.confidenceThreshold || 0.7;
  }

  /**
   * Stage 1: Immediate verification after account creation
   * @param {Object} page - Playwright page object
   * @returns {Object} { confidence: number, signals: [], passed: boolean }
   */
  async verifyImmediate(page) {
    const url = page.url();
    // Use innerText for reliable visible text extraction (Google/Wiz pages return raw JS with textContent)
    const bodyText = await page.locator('body').innerText({ timeout: 3000 }).catch(() => 
      page.textContent('body').catch(() => '')
    );
    
    // Success signals with weights
    const successSignals = [
      { pattern: /myaccount\.google\.com/, weight: 0.7, name: 'myaccount_redirect' },
      { pattern: /gds\.google\.com/, weight: 0.7, name: 'gds_redirect' },
      { pattern: /accounts\.google\.com\/b\//, weight: 0.6, name: 'accounts_b_redirect' },
      { pattern: /accounts\.google\.com\/signin/, weight: 0.3, name: 'signin_redirect' },
      { pattern: /welcome|환영|欢迎|bienvenue/i, weight: 0.25, name: 'welcome_text' },
      { pattern: /account.*created|계정.*생성|账户.*创建/i, weight: 0.3, name: 'creation_confirm' },
      { pattern: /setup.*complete|설정.*완료/i, weight: 0.2, name: 'setup_complete' }
    ];
    const failureSignals = [
      { pattern: /cannot create|만들 수 없습니다|无法创建|creation.*failed/i, weight: -1.0, name: 'creation_failed' },
      { pattern: /qr_code|qr.*코드|qr.*验证/i, weight: -0.8, name: 'qr_blocked' },
      { pattern: /phone.*verification.*required|verify.*phone|전화.*인증/i, weight: -0.5, name: 'phone_required' },
      { pattern: /suspicious|suspicious.*activity|의심|可疑/i, weight: -0.7, name: 'suspicious_activity' },
      { pattern: /blocked|차단|阻止/i, weight: -0.9, name: 'account_blocked' }
    ];
    
    let confidence = 0;
    const matchedSignals = [];
    
    // Calculate confidence
    for (const signal of successSignals) {
      if (signal.pattern.test(url) || signal.pattern.test(bodyText)) {
        confidence += signal.weight;
        matchedSignals.push({ type: 'success', ...signal });
      }
    }
    
    for (const signal of failureSignals) {
      if (signal.pattern.test(url) || signal.pattern.test(bodyText)) {
        confidence += signal.weight;
        matchedSignals.push({ type: 'failure', ...signal });
      }
    }
    
    // Normalize confidence to 0-1 range
    confidence = Math.max(0, Math.min(1, confidence));
    
    return {
      stage: 'immediate',
      confidence,
      passed: confidence >= this.confidenceThreshold,
      signals: matchedSignals,
      url,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Stage 2: Delayed verification (5-10 min after creation)
   * @param {string} email - Account email
   * @param {string} password - Account password
   * @returns {Object} verification result
   */
  async verifyDelayed(email, password) {
    console.log(`[Verification] Waiting ${this.delayedVerificationMinutes} minutes before delayed verification...`);
    await sleep(this.delayedVerificationMinutes * 60 * 1000);
    
    // Try IMAP first (most reliable)
    try {
      const imapResult = await this.testImapConnection(email, password);
      if (imapResult.success) {
        return {
          stage: 'delayed',
          valid: true,
          method: 'imap',
          details: imapResult,
          timestamp: new Date().toISOString()
        };
      }
    } catch (err) {
      console.log(`[Verification] IMAP check failed: ${err.message}`);
    }
    
    // Fallback to web login test
    try {
      const webResult = await this.testWebLogin(email, password);
      return {
        stage: 'delayed',
        valid: webResult.success,
        method: 'web_login',
        details: webResult,
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      return {
        stage: 'delayed',
        valid: false,
        method: 'both_failed',
        error: err.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Test IMAP connection (most reliable verification)
   */
  async testImapConnection(email, password) {
    return new Promise((resolve, reject) => {
      const pythonScript = `
import sys
import imaplib

try:
    mail = imaplib.IMAP4_SSL('imap.gmail.com', 993)
    mail.login('${email}', '${password}')
    mail.select('inbox')
    status, messages = mail.search(None, 'ALL')
    count = len(messages[0].split()) if messages[0] else 0
    mail.logout()
    print(f"SUCCESS:{count}")
except Exception as e:
    print(f"FAILED:{str(e)}")
    sys.exit(1)
`;
      
      const python = spawn('python3', ['-c', pythonScript], {
        timeout: 30000,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
      });
      
      let output = '';
      python.stdout.on('data', (data) => { output += data.toString(); });
      python.stderr.on('data', (data) => { console.error(`IMAP test error: ${data}`); });
      
      python.on('close', (code) => {
        const result = output.trim();
        if (result.startsWith('SUCCESS:')) {
          const messageCount = parseInt(result.split(':')[1], 10);
          resolve({ success: true, messageCount });
        } else {
          reject(new Error(result.split(':')[1] || 'IMAP connection failed'));
        }
      });
      
      python.on('error', (err) => {
        reject(new Error(`Failed to run IMAP test: ${err.message}`));
      });
    });
  }

  /**
   * Test web login (fallback method)
   */
  async testWebLogin(email, password) {
    // This would require a headless browser check
    // For now, return a placeholder that indicates need for implementation
    return {
      success: false,
      note: 'Web login test requires browser automation - implement if IMAP unavailable'
    };
  }

  /**
   * Stage 3: Batch verification (24hr after creation)
   * @param {Array} accounts - List of {email, refreshToken} objects
   * @returns {Array} verification results
   */
  async verifyBatch(accounts) {
    const results = [];
    
    for (const account of accounts) {
      try {
        const isValid = await this.validateOAuthToken(account.refreshToken);
        results.push({
          email: account.email,
          active: isValid,
          stage: 'batch',
          timestamp: new Date().toISOString()
        });
      } catch (err) {
        results.push({
          email: account.email,
          active: false,
          error: err.message,
          stage: 'batch',
          timestamp: new Date().toISOString()
        });
      }
    }
    
    return results;
  }

  /**
   * Validate OAuth refresh token
   */
  async validateOAuthToken(refreshToken) {
    // Token validation logic would go here
    // For now, assume valid if token exists
    return !!refreshToken;
  }

  /**
   * Run complete verification pipeline
   */
  async runFullPipeline(page, account) {
    const results = {
      email: account.email,
      stages: []
    };
    
    // Stage 1: Immediate
    const immediate = await this.verifyImmediate(page);
    results.stages.push(immediate);
    results.immediatePassed = immediate.passed;
    
    if (!immediate.passed) {
      results.finalStatus = 'failed_immediate';
      return results;
    }
    
    // Stage 2: Delayed (only if immediate passed)
    const delayed = await this.verifyDelayed(account.email, account.password);
    results.stages.push(delayed);
    results.delayedPassed = delayed.valid;
    
    results.finalStatus = delayed.valid ? 'verified' : 'failed_delayed';
    
    return results;
  }
}

// Helper function for simple immediate verification
export async function quickVerify(page, options = {}) {
  const pipeline = new AccountVerificationPipeline(options);
  return pipeline.verifyImmediate(page);
}
