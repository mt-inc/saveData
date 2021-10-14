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
  private count: { [x in Pairs]: number };
  private usablePair: Pairs[];
  private basefilenames: { [x in Pairs]: string };
  private filenames: { [x in Pairs]: string };
  private filelength: number;
  private totalCount: { [x in Pairs]: number };
  private io: Server;
  private timer: NodeJS.Timer | null;
  private streams: { [x in Pairs]: fs.WriteStream | null };
  private lastData: { [x in Pairs]: number };
  private watchdog: NodeJS.Timer | null;
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
    ];
    this.basefilenames = {
      BTCUSDT: '../trades/btc/btcusdt-',
      BNBUSDT: '../trades/bnb/bnbusdt-',
      ETHUSDT: '../trades/eth/ethusdt-',
      ADAUSDT: '../trades/ada/adausdt-',
      DOGEUSDT: '../trades/doge/dogeusdt-',
      DOTUSDT: '../trades/dot/dotusdt-',
      BTCBUSD: '../trades/btcb/btcbusd-',
      ETHBUSD: '../trades/ehtb/ethbusd-',
      BNBBUSD: '../trades/bnbb/bnbbusd-',
      DOGEBUSD: '../trades/dogeb/dogebusd-',
      SOLUSDT: '../trades/sol/solusdt-',
      XRPUSDT: '../trades/xrp/xrpusdt-',
    };
    this.filenames = {
      BTCUSDT: `${new Date().getTime()}.csv`,
      BNBUSDT: `${new Date().getTime()}.csv`,
      ETHUSDT: `${new Date().getTime()}.csv`,
      ADAUSDT: `${new Date().getTime()}.csv`,
      DOGEUSDT: `${new Date().getTime()}.csv`,
      DOTUSDT: `${new Date().getTime()}.csv`,
      BTCBUSD: `${new Date().getTime()}.csv`,
      ETHBUSD: `${new Date().getTime()}.csv`,
      BNBBUSD: `${new Date().getTime()}.csv`,
      DOGEBUSD: `${new Date().getTime()}.csv`,
      SOLUSDT: `${new Date().getTime()}.csv`,
      XRPUSDT: `${new Date().getTime()}.csv`,
    };
    this.filelength = 200000;
    this.count = {
      BTCUSDT: 0,
      BNBUSDT: 0,
      ETHUSDT: 0,
      ADAUSDT: 0,
      DOGEUSDT: 0,
      DOTUSDT: 0,
      BTCBUSD: 0,
      ETHBUSD: 0,
      BNBBUSD: 0,
      DOGEBUSD: 0,
      SOLUSDT: 0,
      XRPUSDT: 0,
    };
    this.totalCount = {
      BTCUSDT: 0,
      BNBUSDT: 0,
      ETHUSDT: 0,
      ADAUSDT: 0,
      DOGEUSDT: 0,
      DOTUSDT: 0,
      BTCBUSD: 0,
      BNBBUSD: 0,
      ETHBUSD: 0,
      DOGEBUSD: 0,
      SOLUSDT: 0,
      XRPUSDT: 0,
    };
    this.lastData = {
      BTCUSDT: 0,
      BNBUSDT: 0,
      ETHUSDT: 0,
      ADAUSDT: 0,
      DOGEUSDT: 0,
      DOTUSDT: 0,
      BTCBUSD: 0,
      BNBBUSD: 0,
      ETHBUSD: 0,
      DOGEBUSD: 0,
      SOLUSDT: 0,
      XRPUSDT: 0,
    };
    this.io = new Server();
    this.io.listen(settings.ioport);
    this.timer = null;
    this.streams = {
      BTCUSDT: null,
      BNBUSDT: null,
      ETHUSDT: null,
      ADAUSDT: null,
      DOGEUSDT: null,
      DOTUSDT: null,
      BTCBUSD: null,
      ETHBUSD: null,
      BNBBUSD: null,
      DOGEBUSD: null,
      SOLUSDT: null,
      XRPUSDT: null,
    };
    this.watchdog = null;
  }
  start() {
    console.log(`${new Time().format(new Date().getTime())}: starting`);
    Object.keys(this.basefilenames)
      .map((item) => this.basefilenames[item])
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
      const basefile = this.basefilenames[pair];
      let suffix = this.filenames[pair];
      if (this.count[pair] > this.filelength) {
        this.streams[pair]?.close();
        this.count[pair] = 0;
        this.streams[pair] = null;
        this.filenames[pair] = `${new Date().getTime()}.csv`;
        suffix = this.filenames[pair];
      }
      if (!this.streams[pair]) {
        this.streams[pair] = fs.createWriteStream(`${basefile}${suffix}`);
        this.streams[pair]?.on('error', (err) => {
          if (err) {
            console.log(err);
          }
        });
      }
      this.lastData[pair] = trade.timestamp;
      const data = [trade.price, trade.quantity, trade.timestamp];
      this.streams[pair]?.write(`${data.join(',')}\n`);
      this.count[pair]++;
      this.totalCount[pair]++;
      this.io.emit(pair, trade);
    };
    let t = this.client.ws.futuresAggTrades(this.usablePair, cbWs);
    this.watchdog = setInterval(() => {
      const now = new Date().getTime();
      let reason = '';
      let rec = false;
      Object.keys(this.lastData).map((pair) => {
        const time = pair.indexOf('BUSD') !== -1 ? 30 * 1000 : 10 * 1000;
        if (this.lastData[pair] > 0 && now - this.lastData[pair] > time) {
          reason = `${reason},${pair} (${now - this.lastData[pair]}ms)`;
          rec = true;
        }
      });
      if (rec) {
        console.log(`${new Date()} reconnecting ${reason}`);
        t();
        Object.keys(this.lastData).map((pair) => {
          this.lastData[pair] = 0;
        });
        Object.keys(this.count).map((pair) => {
          this.count[pair] = 200001;
        });
        t = this.client.ws.futuresAggTrades(this.usablePair, cbWs);
      }
    }, 10 * 1000);
    this.timer = setInterval(() => {
      const d = Object.keys(this.totalCount)
        .map((item) => `${item}: ${this.totalCount[item]}`)
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
    Object.keys(this.streams).map((pair) => {
      if (this.streams[pair]) {
        this.streams[pair]?.close();
      }
    });
  }
}

new saveData().start();
