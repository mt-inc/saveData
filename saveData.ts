import fs from 'fs';
import Binance, { AggregatedTrade } from 'binance-api-node';
import { Server } from 'socket.io';
import settings from './settings.json';
import { Time, constants } from '@mt-inc/utils';

declare global {
  interface ObjectConstructor {
    keys<T>(o: T): Array<keyof T>;
  }
}

type Pairs = constants.Pairs;

class saveData {
  private client;
  private usablePair: Pairs[];
  private filelength: number;
  private io: Server;
  private timer: NodeJS.Timer | null;
  private watchdog: NodeJS.Timer | null;
  private mainData: {
    basefilenames: { [x in Pairs]: string };
    filenames: { [x in Pairs]: string };
    count: { [x in Pairs]: number };
    totalCount: { [x in Pairs]: number };
    lastData: { [x in Pairs]: number };
    writeStreams: { [x in Pairs]: fs.WriteStream | null };
    isRestart: { [x in Pairs]: boolean };
    restartTime: { [x in Pairs]: number };
    ws: { [x in Pairs]: (() => void) | null };
  };
  constructor() {
    this.client = Binance();
    this.usablePair = [
      'BTCUSDT',
      'BNBUSDT',
      'ETHUSDT',
      'ADAUSDT',
      'DOGEUSDT',
      'DOTUSDT',
      'BTCBUSD',
      'ETHBUSD',
      'BNBBUSD',
      'DOGEBUSD',
      'SOLUSDT',
      'XRPUSDT',
      '1000SHIBUSDT',
      'LINKUSDT',
      'ATOMUSDT',
      'FTMUSDT',
      'NEARUSDT',
      'LUNAUSDT',
    ];

    this.mainData = {
      //@ts-ignore
      basefilenames: {},
      //@ts-ignore
      filenames: {},
      //@ts-ignore
      count: {},
      //@ts-ignore
      totalCount: {},
      //@ts-ignore,
      writeStreams: {},
      //@ts-ignore
      lastData: {},
      //@ts-ignore
      isRestart: {},
      //@ts-ignore
      ws: {},
      //@ts-ignore
      restartTime: {},
    };
    this.usablePair.map((pair) => {
      let trimmed = pair.replace('USDT', '').replace('BUSD', 'b').toLowerCase();
      if (trimmed === 'ethb') {
        trimmed = 'ehtb';
      }
      this.mainData.basefilenames[pair] = `../trades/${trimmed}/${pair.toLowerCase()}-`;
      this.mainData.filenames[pair] = `${new Date().getTime()}.csv`;
      this.mainData.count[pair] = 0;
      this.mainData.totalCount[pair] = 0;
      this.mainData.writeStreams[pair] = null;
      this.mainData.lastData[pair] = 0;
      this.mainData.isRestart[pair] = false;
      this.mainData.ws[pair] = null;
      this.mainData.restartTime[pair] = 0;
    });
    this.filelength = 200000;
    this.io = new Server();
    this.io.listen(settings.ioport);
    this.timer = null;
    this.watchdog = null;
  }
  start() {
    console.log(`${new Time().format(new Date().getTime())}: starting`);
    Object.keys(this.mainData.basefilenames)
      .map((item) => this.mainData.basefilenames[item])
      .map((item) => item.split('/'))
      .map((item) => {
        item.map((dir, ind) => {
          if (dir.indexOf('-') === -1) {
            if (ind > 0) {
              const prev = item.map((d, i) => (i < ind ? d : '')).join('/');
              if (!fs.existsSync(`${prev}/${dir}`)) {
                fs.mkdirSync(`${prev}/${dir}`);
              }
            } else {
              if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir);
              }
            }
          }
        });
      });
    console.log(`${new Time().format(new Date().getTime())}: directory prepared`);
    const cbWs = (trade: AggregatedTrade) => {
      const pair = trade.symbol as Pairs;
      if (this.usablePair.includes(pair)) {
        const basefile = this.mainData.basefilenames[pair];
        let suffix = this.mainData.filenames[pair];
        if (this.mainData.count[pair] > this.filelength) {
          this.mainData.writeStreams[pair]?.close();
          this.mainData.count[pair] = 0;
          this.mainData.writeStreams[pair] = null;
          this.mainData.filenames[pair] = `${new Date().getTime()}.csv`;
          suffix = this.mainData.filenames[pair];
        }
        if (!this.mainData.writeStreams[pair]) {
          this.mainData.writeStreams[pair] = fs.createWriteStream(`${basefile}${suffix}`);
          this.mainData.writeStreams[pair]?.on('error', (err) => {
            if (err) {
              console.log(err);
            }
          });
        }
        this.mainData.isRestart[pair] = false;
        this.mainData.lastData[pair] = trade.timestamp;
        const data = [trade.price, trade.quantity, trade.timestamp];
        this.mainData.writeStreams[pair]?.write(`${data.join(',')}\n`);
        this.mainData.count[pair]++;
        this.mainData.totalCount[pair]++;
        this.io.emit(pair, trade);
      }
    };
    this.usablePair.map((pair) => {
      this.mainData.ws[pair] = this.client.ws.futuresAggTrades(pair, cbWs);
    });
    const reconnect = (pair: Pairs, now: number, reason?: string) => {
      if (typeof this.mainData.ws[pair] === 'function') {
        //@ts-ignore
        this.mainData.ws[pair]();
      }
      console.log(
        `${new Time().format(new Date().getTime())}: ${pair} - ${
          reason ?? `${(now - this.mainData.lastData[pair]).toLocaleString()} ms`
        }`,
      );
      this.mainData.count[pair] = 200001;
      this.mainData.lastData[pair] = 0;
      this.mainData.ws[pair] = this.client.ws.futuresAggTrades(pair, cbWs);
      this.mainData.isRestart[pair] = true;
      this.mainData.restartTime[pair] = new Date().getTime();
    };
    this.watchdog = setInterval(() => {
      const now = new Date().getTime();
      Object.keys(this.mainData.lastData).map((pair) => {
        if (this.mainData.isRestart[pair] && now - this.mainData.restartTime[pair] > 5 * 1000) {
          return reconnect(
            pair,
            now,
            `reconnection timeout ${(now - this.mainData.restartTime[pair]).toLocaleString()} ms`,
          );
        }
        const time = pair.indexOf('BUSD') !== -1 ? (pair === 'DOGEBUSD' ? 40 * 1000 : 30 * 1000) : 15 * 1000;
        if (this.mainData.lastData[pair] > 0 && now - this.mainData.lastData[pair] > time) {
          return reconnect(pair, now);
        }
      });
    }, 10 * 1000);
    this.timer = setInterval(() => {
      const d = Object.keys(this.mainData.totalCount)
        .map((item) => `${item}: ${this.mainData.totalCount[item]}`)
        .join(', ');
      console.log(`${new Time().format(new Date().getTime())}: ${d}`);
    }, 4 * 60 * 60 * 1000);
  }
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.watchdog) {
      clearInterval(this.watchdog);
      this.watchdog = null;
    }
    Object.keys(this.mainData.writeStreams).map((pair) => {
      if (this.mainData.writeStreams[pair]) {
        this.mainData.writeStreams[pair]?.close();
      }
    });
    Object.keys(this.mainData.ws).map((pair) => {
      if (typeof this.mainData.ws[pair] === 'function') {
        //@ts-ignore
        this.mainData.ws[pair]();
      }
    });
  }
}

new saveData().start();
