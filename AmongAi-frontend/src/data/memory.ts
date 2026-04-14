export default class Memory {
  sight: Record<string, string[]> = {};
  othersactivity: Record<string, string[]> = {};
  myactivity: string[] = [];

  writeSight(
    ownerName: string,
    targetName: string,
    isDead: boolean,
    location: string,
  ) {
    if (!this.sight[ownerName]) {
      this.sight[ownerName] = [];
    }
    const humanTime = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    this.sight[ownerName].push(
      `[${humanTime}]:${targetName} was found ${isDead ? 'DEAD' : 'ALIVE'} at ${location}`,
    );

    if (this.sight[ownerName].length > 20) {
      this.sight[ownerName].shift(); // keep only the recent 20 logs
    }
  }
  writeOthersActivity(
    ownerName: string,
    targetName: string,
    task: boolean,
    timeSpan: string,
  ) {
    if (!this.othersactivity[ownerName]) {
      this.othersactivity[ownerName] = [];
    }
    const humanTime = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    this.othersactivity[ownerName].push(
      `[${humanTime}]:${targetName} is standing near ${task} for ${timeSpan}s`,
    );

    if (this.othersactivity[ownerName].length > 20) {
      this.othersactivity[ownerName].shift(); // keep only the recent 20 logs
    }
  }

  writeMyActivity(action: string, location: string) {
    const humanTime = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    this.myactivity.push(`[${humanTime}]:I was in ${location} doing ${action}`);

    if (this.myactivity.length > 20) {
      this.myactivity.shift(); // keep only the recent 20 logs
    }
  }

  readSight() {
    return this.sight;
  }
  readOthersActivity() {
    return this.othersactivity;
  }
  readMyActivity() {
    return this.myactivity;
  }
}
