export default class Memory {
  sight: string[] = [];
  othersactivity: string[] = [];
  myactivity: string[] = [];
  fakeactivity: string[] = [];
  allegations: string[] = [];
  MajorEvents: string[] = [];
  private getTime(): string {
    return new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }
  private addSus(targetName: string, amount: number) {
    if (!this.susMatrix[targetName]) this.susMatrix[targetName] = 0;
    this.susMatrix[targetName] = Math.max(
      0,
      Math.min(100, this.susMatrix[targetName] + amount),
    );
  }
  constructor() {
    this.addSus('CHRIS', 99);
  }
  susMatrix: Record<string, number> = {};
  writeSight(targetName: string, isDead: boolean, location: string) {
    this.sight.push(
      `[${this.getTime()}]:${targetName} was found ${isDead ? 'DEAD' : 'ALIVE'} at ${location}`,
    );

    if (this.sight.length > 10) {
      this.sight.shift(); // keep only the recent 10 logs
    }
    if (!isDead) this.addSus(targetName, -2); // doing normal things so lowers sus
  }
  writeOthersActivity(targetName: string, task: boolean, timeSpan: string) {
    this.othersactivity.push(
      `[${this.getTime()}]:${targetName} is standing near ${task} for ${timeSpan}s`,
    );

    if (this.othersactivity.length > 10) {
      this.othersactivity.shift(); // keep only the recent 10 logs
    }
    this.addSus(targetName, 5); // following or stacking near task creates sus
  }

  writeMyActivity(action: string, location: string) {
    this.myactivity.push(
      `[${this.getTime()}]:I was in ${location} doing ${action}`,
    );
    if (this.myactivity.length > 10) {
      this.myactivity.shift(); // keep only the recent 10 logs
    }
  }
  writeFakeActivity() {
    //take random correct data from crewmates data or hallucinate or give data like below commented
    // this.fakeactivity.push(`[${this.getTime()}] I was in ${location} doing ${action}`)
    if (this.fakeactivity.length > 10) {
      this.fakeactivity.shift(); // keep only the recent 10 logs
    }
  }
  //for 100% surity
  writeAllegation(
    targetName: string,
    alligationType: 'VENTING' | 'KILLING',
    location: string,
  ) {
    this.allegations.push(
      `[${this.getTime()}]: I literally saw ${targetName} ${alligationType} in ${location}`,
    );
    if (this.allegations.length > 10) {
      this.allegations.shift(); // keep only the recent 10 logs
    }
    this.addSus(targetName, 100); //sure
  }
  //MAJOR EVENTS: such as sabotaged or meeting called
  writeMajorEvent(eventName: string) {
    this.MajorEvents.push(`[${this.getTime()}] ${eventName}`);
    if (this.MajorEvents.length > 10) {
      this.MajorEvents.shift(); // keep only the recent 10 logs
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

  //EXPORTING FOR LLMs
  getImpostorData() {
    return {
      realActions: this.myactivity,
      fakeActions: this.fakeactivity,
      MajorEvents: this.MajorEvents,
    };
  }
  getCrewmateData() {
    return {
      myActions: this.myactivity,
      observations: [...this.sight, ...this.othersactivity],
      hardEvidence: this.allegations,
      MajorEvents: this.MajorEvents,
    };
  }
  //NEW VOTING SYS
  getVoteDecision(alivePlayers: string[]): string {
    let susThreshold = 30;
    let target = 'skip';
    console.warn(this.susMatrix);
    alivePlayers.forEach((player) => {
      const sus = this.susMatrix[player] || 0;
      if (sus > susThreshold) {
        susThreshold = sus;
        target = player;
      }
    });
    return target;
  }
}
