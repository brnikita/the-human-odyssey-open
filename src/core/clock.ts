/** Game time: day/night cycle and elapsed seconds. */
export const DAY_LENGTH_SECONDS = 12 * 60; // one game day in real seconds

export class GameClock {
  /** 0..1 (0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset) */
  timeOfDay = 0.3;
  dayCount = 1;
  elapsed = 0;
  timeScale = 1;

  advance(dt: number) {
    const scaled = dt * this.timeScale;
    this.elapsed += scaled;
    this.timeOfDay += scaled / DAY_LENGTH_SECONDS;
    while (this.timeOfDay >= 1) {
      this.timeOfDay -= 1;
      this.dayCount++;
    }
  }

  /** Skip forward by a fraction of a day (sleeping). */
  skip(fractionOfDay: number) {
    this.advance(fractionOfDay * DAY_LENGTH_SECONDS);
  }

  get isNight(): boolean {
    return this.timeOfDay < 0.22 || this.timeOfDay > 0.8;
  }

  get hourLabel(): string {
    const h = Math.floor(this.timeOfDay * 24);
    const m = Math.floor((this.timeOfDay * 24 - h) * 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }
}
