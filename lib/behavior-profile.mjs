/** @file lib/behavior-profile.mjs
 * Human-like behavior simulation for automation
 * Generates realistic typing patterns, mouse movements, and attention spans
 */

import { randomInt } from './cdp-utils.mjs';

export class HumanBehaviorProfile {
  constructor(seed = null) {
    this.seed = seed || this.generateSeed();
    this.typingProfile = this.generateTypingProfile();
    this.mouseProfile = this.generateMouseProfile();
    this.attentionProfile = this.generateAttentionProfile();
  }

  generateSeed() {
    return Math.floor(Math.random() * 0xFFFFFFFF);
  }

  /**
   * Generate realistic typing profile based on WPM distribution
   * Slow: 30 WPM, Average: 60 WPM, Fast: 90 WPM
   */
  generateTypingProfile() {
    const wpm = this.sampleNormal(60, 15);
    const msPerChar = 60000 / (wpm * 5); // Average word length: 5 chars
    
    return {
      wpm,
      msPerChar: Math.max(80, Math.min(400, msPerChar)),
      errorRate: this.sampleNormal(0.02, 0.01), // 1-3% error rate
      pauseAfterWord: this.sampleNormal(300, 100),
      pauseAfterSentence: this.sampleNormal(800, 200),
      burstLength: Math.floor(this.sampleNormal(5, 2)), // chars per burst
      correctionDelay: this.sampleNormal(200, 50)
    };
  }

  /**
   * Generate mouse movement profile
   */
  generateMouseProfile() {
    return {
      baseSpeed: this.sampleNormal(800, 200), // pixels per second
      acceleration: this.sampleNormal(0.3, 0.1),
      hesitationChance: this.sampleNormal(0.1, 0.05),
      overshootChance: this.sampleNormal(0.05, 0.02)
    };
  }

  /**
   * Generate attention span profile
   */
  generateAttentionProfile() {
    return {
      minFocusTime: this.sampleNormal(2000, 500),
      distractionChance: this.sampleNormal(0.05, 0.02),
      distractionDuration: this.sampleNormal(3000, 1000),
      tabSwitchChance: this.sampleNormal(0.02, 0.01)
    };
  }

  /**
   * Type text with human-like behavior
   * @param {Object} page - Playwright page
   * @param {Object} element - Element to type into
   * @param {string} text - Text to type
   */
  async typeWithProfile(page, element, text) {
    // Click element first to focus it
    await element.click();
    await this.delay(randomInt(200, 500));
    
    const words = text.split(/(\s+)/); // Keep whitespace
    let charCount = 0;
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      
      // Skip pure whitespace
      if (/^\s+$/.test(word)) {
        for (const char of word) {
          await element.press(char === ' ' ? 'Space' : char);
          await this.delay(this.typingProfile.msPerChar * 0.5);
        }
        continue;
      }
      
      // Type word in bursts
      let burstCount = 0;
      for (const char of word) {
        // Random typo
        if (Math.random() < this.typingProfile.errorRate) {
          await this.makeTypo(element, char);
        }
        
        // Type character
        await element.type(char, {
          delay: Math.max(50, this.sampleNormal(
            this.typingProfile.msPerChar,
            this.typingProfile.msPerChar * 0.3
          ))
        });
        
        charCount++;
        burstCount++;
        
        // Pause between bursts
        if (burstCount >= this.typingProfile.burstLength) {
          await this.delay(this.sampleNormal(200, 50));
          burstCount = 0;
        }
        
        // Occasional longer pause (thinking)
        if (Math.random() < 0.05) {
          await this.delay(this.sampleNormal(500, 150));
        }
      }
      
      // Pause after word/sentence
      const isEndOfSentence = /[.!?]$/.test(word);
      const pauseDuration = isEndOfSentence 
        ? this.typingProfile.pauseAfterSentence
        : this.typingProfile.pauseAfterWord;
      
      await this.delay(pauseDuration);
    }
  }

  /**
   * Simulate a typo and correction
   */
  async makeTypo(element, intendedChar) {
    // Adjacent key typos
    const adjacentKeys = {
      'a': 's', 's': 'asd', 'd': 'sf', 'f': 'dg', 'g': 'fh',
      'q': 'w', 'w': 'qe', 'e': 'wr', 'r': 'et', 't': 'ry',
      'z': 'x', 'x': 'zc', 'c': 'xv', 'v': 'cb', 'b': 'vn'
    };
    
    const typo = adjacentKeys[intendedChar.toLowerCase()] 
      ? adjacentKeys[intendedChar.toLowerCase()][0]
      : intendedChar;
    
    // Type wrong character
    await element.type(typo, { delay: 50 });
    await this.delay(this.sampleNormal(150, 50)); // Recognition time
    
    // Backspace
    await element.press('Backspace');
    await this.delay(this.sampleNormal(80, 20));
    
    // Retype correct character
    await element.type(intendedChar, { delay: 80 });
  }

  /**
   * Move mouse with human-like curve
   */
  async moveMouseWithProfile(page, targetX, targetY) {
    // Get current mouse position
    const currentPos = await page.evaluate(() => ({
      x: window.mouseX || 0,
      y: window.mouseY || 0
    }));
    
    // Generate Bezier curve points
    const points = this.generateBezierCurve(
      currentPos.x, currentPos.y,
      targetX, targetY
    );
    
    for (const point of points) {
      await page.mouse.move(point.x, point.y);
      await this.delay(10 + Math.random() * 20);
    }
  }

  /**
   * Generate Bezier curve points for mouse movement
   */
  generateBezierCurve(x1, y1, x2, y2, numPoints = 20) {
    const points = [];
    
    // Control point (creates curve)
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const offsetX = (Math.random() - 0.5) * 100;
    const offsetY = (Math.random() - 0.5) * 100;
    const cx = midX + offsetX;
    const cy = midY + offsetY;
    
    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      
      // Quadratic Bezier: B(t) = (1-t)²P₀ + 2(1-t)tP₁ + t²P₂
      const x = Math.pow(1 - t, 2) * x1 + 
                2 * (1 - t) * t * cx + 
                Math.pow(t, 2) * x2;
      const y = Math.pow(1 - t, 2) * y1 + 
                2 * (1 - t) * t * cy + 
                Math.pow(t, 2) * y2;
      
      points.push({ x: Math.round(x), y: Math.round(y) });
    }
    
    return points;
  }

  /**
   * Simulate reading/thinking pause
   */
  async simulateReading(page, duration = null) {
    const readTime = duration || this.sampleNormal(3000, 1000);
    
    // Occasional scrolling while reading
    const scrollCount = Math.floor(readTime / 2000);
    for (let i = 0; i < scrollCount; i++) {
      await this.delay(1500);
      await page.mouse.wheel(0, randomInt(100, 300));
    }
    
    await this.delay(readTime % 2000);
  }

  /**
   * Sample from normal distribution (Box-Muller transform)
   */
  sampleNormal(mean, stdDev) {
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z0 * stdDev;
  }

  /**
   * Random delay with normal distribution
   */
  async delay(ms) {
    const actualDelay = Math.max(50, this.sampleNormal(ms, ms * 0.2));
    await new Promise(resolve => setTimeout(resolve, actualDelay));
  }

  /**
   * Get profile summary for logging
   */
  getProfileSummary() {
    return {
      typingWPM: Math.round(this.typingProfile.wpm),
      errorRate: (this.typingProfile.errorRate * 100).toFixed(1) + '%',
      mouseSpeed: Math.round(this.mouseProfile.baseSpeed) + 'px/s',
      attentionSpan: Math.round(this.attentionProfile.minFocusTime / 1000) + 's'
    };
  }
}

/**
 * Factory function to create or load profile
 */
export function createBehaviorProfile(seed = null) {
  return new HumanBehaviorProfile(seed);
}

/**
 * Quick typing helper with default profile
 */
export async function humanType(page, element, text, seed = null) {
  const profile = createBehaviorProfile(seed);
  await profile.typeWithProfile(page, element, text);
}
