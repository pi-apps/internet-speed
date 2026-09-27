export class PingRunner extends EventTarget {
  constructor(targets, cfg = {}) {
    super();
    this.targets = targets;
    this.samples = cfg.samples ?? 4;
    this.timeoutMs = cfg.timeoutMs ?? 5000;
    this.gapMs = cfg.gapMs ?? 60;
    this.running = false;
    this.aborted = false;
  }

  async run() {
    if (this.running) return [];
    this.running = true;
    this.aborted = false;

    const results = [];
    for (const [index, target] of this.targets.entries()) {
      if (this.aborted) break;

      this.dispatchEvent(
        new CustomEvent('target:start', {
          detail: { target, index, total: this.targets.length },
        })
      );

      const result = await this.probeTarget(target);
      results.push(result);

      this.dispatchEvent(
        new CustomEvent('target:done', {
          detail: { ...result, index, total: this.targets.length },
        })
      );
    }

    this.running = false;
    this.dispatchEvent(new CustomEvent('finished', { detail: { results } }));
    return results;
  }

  abort() {
    this.aborted = true;
  }

  async probeTarget(target) {
    const timings = [];
    let reachable = false;

    for (let i = 0; i < this.samples; i++) {
      if (this.aborted) break;
      const ms = await this.probeOnce(target.url);
      if (ms !== null) {
        reachable = true;
        if (i > 0) timings.push(ms);
      }
      if (i < this.samples - 1) await sleep(this.gapMs);
    }

    const latency = timings.length ? Math.round(Math.min(...timings) * 10) / 10 : null;
    return {
      target: target.id,
      name: target.name,
      hint: target.hint,
      latency,
      ok: reachable && latency !== null,
      spread: timings.length > 1
        ? Math.round((Math.max(...timings) - Math.min(...timings)) * 10) / 10
        : null,
    };
  }

  async probeOnce(url) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
    const bust = (url.includes('?') ? '&' : '?') + 'ng=' + Date.now() + Math.random();
    const t0 = performance.now();
    try {
      await fetch(url + bust, {
        mode: 'no-cors',
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'follow',
        signal: ctl.signal,
      });
      return performance.now() - t0;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Monitor {
  constructor(runFn) {
    this.runFn = runFn;
    this.intervalMs = 0;
    this.timer = null;
    this.nextAt = null;
    this.onTick = null;
  }

  start(seconds) {
    this.stop();
    if (!seconds) return;
    this.intervalMs = seconds * 1000;
    this.schedule();
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = null;
    this.nextAt = null;
    this.intervalMs = 0;
    this.onTick?.(null);
  }

  get running() {
    return this.intervalMs > 0;
  }

  schedule() {
    this.nextAt = Date.now() + this.intervalMs;
    this.onTick?.(this.nextAt);
    this.timer = setTimeout(async () => {
      if (document.visibilityState === 'visible') {
        try {
          await this.runFn();
        } catch {
        }
      }
      if (this.intervalMs) this.schedule();
    }, this.intervalMs);
  }
}

export function medianLatency(results) {
  const values = results.filter((r) => r.ok).map((r) => r.latency).sort((a, b) => a - b);
  if (!values.length) return null;
  const mid = Math.floor(values.length / 2);
  return values.length % 2
    ? values[mid]
    : Math.round(((values[mid - 1] + values[mid]) / 2) * 10) / 10;
}
