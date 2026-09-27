export class Widget extends EventTarget {
  constructor(container, cfg) {
    super();
    this.container = container;
    this.cfg = cfg.widget;
    this.frame = null;
  }

  mount() {
    if (this.frame) this.frame.remove();

    const frame = document.createElement('iframe');
    frame.src = this.cfg.url;
    frame.title = 'OpenSpeedTest speed test widget';
    frame.loading = 'eager';
    frame.setAttribute('scrolling', 'no');
    frame.addEventListener('load', () => {
      this.container.dataset.loaded = 'true';
      this.dispatchEvent(new CustomEvent('ready'));
    });

    this.container.append(frame);
    this.frame = frame;
    return frame;
  }
}
