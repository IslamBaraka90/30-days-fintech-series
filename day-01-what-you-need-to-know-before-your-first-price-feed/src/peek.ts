import { Alpaca } from "@alpacahq/alpaca-trade-api";

const symbol = (process.env.SYMBOL ?? "SPY").toUpperCase();
const alpaca = new Alpaca();
const stream = alpaca.marketData.stockStream({
  feed: "iex",
  reconnect: false,
});

let received = 0;

stream.onConnect(() => stream.subscribeForTrades([symbol]));
stream.onTrade((trade) => {
  console.log({
    symbol: trade.symbol,
    time: trade.timestamp.toISOString(),
    price: trade.price,
    size: trade.size,
    exchange: trade.exchange,
  });

  if (++received === 5) stream.disconnect();
});
stream.onError((error) => {
  console.error(error);
  process.exitCode = 1;
});

stream.connect();
