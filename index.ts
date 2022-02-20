import trades from "./trades.json";

const tradesList = trades as unknown as executor.trade[];

// Market trade logic
const orderTypes: executor.orderDescription[] = [
  "market buy",
  "limit buy",
  "stop-limit buy",
  "market sell",
  "limit sell",
  "stop-limit sell",
];

// Current Market
class currentMarket {
  currentMarket: executor.currentMarket[];
  constructor() {
    this.currentMarket = [
      {
        price: 500,
        high: 505,
        low: 480,
        volumne: 0,
        timestamp: new Date().getTime(),
      },
    ];
  }

  // Get latest Market price
  getCurrentPrice = () => this.currentMarket[this.currentMarket.length - 1];

  // Update Market Price
  updateMarket = (value: executor.currentMarket) =>
    this.currentMarket.push(value);
}

// Order Books
class orderBooks {
  orderBook: executor.orderBook[];
  constructor() {
    this.orderBook = [];
  }

  // Update orderBook
  addTrade = (value: executor.orderBook) => this.orderBook.push(value);

  // Get minimum price
  currentMinimum = () =>
    this.orderBook
      // .filter(({ executedCoins }) => executedCoins > 0)
      .reduce(
        (prevOrder: executor.orderBook, currentOrder: executor.orderBook) =>
          prevOrder.price < currentOrder.price ? prevOrder : currentOrder
      );

  // Get maximum price
  currentMaximum = () =>
    this.orderBook
      // .filter(({ executedCoins }) => executedCoins > 0)
      .reduce(
        (prevOrder: executor.orderBook, currentOrder: executor.orderBook) =>
          prevOrder.price > currentOrder.price ? prevOrder : currentOrder
      );

  // Get Volumne of price
  priceVolumne = (price: number) =>
    this.orderBook.filter(
      (order) => order.price === price && order.executedCoins > 0
    ).length;

  // Common finder
  finder = (price: number, side: "buy" | "sell") =>
    this.orderBook
      .filter(
        (order) =>
          order.side === side &&
          order.price === price &&
          order.status !== "completed"
      )
      .sort((a, b) => a.noOfCoins - b.noOfCoins)
      .reverse();

  // Get Price Matches for Buy
  getSeller = (price: number) => this.finder(price, "sell");

  // Get Price Matches for Sell
  getBuyer = (price: number) => this.finder(price, "buy");

  // Get Min Price from Seller
  getOptimalSeller = () =>
    this.orderBook
      .filter((order) => order.side === "sell")
      .reduce(
        (prevOrder: executor.orderBook, currentOrder: executor.orderBook) =>
          prevOrder.price < currentOrder.price ? prevOrder : currentOrder
      );

  // Get Max Price from Buyer
  getOptimalBuyer = () =>
    this.orderBook
      .filter((order) => order.side === "buy")
      .reduce(
        (prevOrder: executor.orderBook, currentOrder: executor.orderBook) =>
          prevOrder.price > currentOrder.price ? prevOrder : currentOrder
      );

  // Get Common market price
  marketFinder = (side: "buy" | "sell") => {
    const dubplicates = this.orderBook
      .filter((order) => order.side === side)
      .map(({ price }) => price)
      .reduce(
        (cnt: { [key: number]: number }, cur: number) => (
          (cnt[cur] = cnt[cur] + 1 || 1), cnt
        ),
        {}
      );
    const values = Object.values(dubplicates);
    return +Object.keys(dubplicates)[values.indexOf(Math.max(...values))];
  };

  // Get Current Market Price from Seller
  getSellerPrice = () => this.marketFinder("sell");

  // Get Current Market Price from Buyer
  getBuyerPrice = () => this.marketFinder("buy");

  // Executed trade update
  updateTrade = (newOrder: executor.orderBook) =>
    this.orderBook.map((order) =>
      order.tradeId === newOrder.tradeId ? newOrder : order
    );
}

class Executor {
  market: currentMarket;
  book: orderBooks;
  constructor() {
    this.market = new currentMarket();
    this.book = new orderBooks();
  }

  // Actual Execution of orders
  autualExecution = (
    newEntry: executor.orderBook,
    order: executor.orderBook
  ) => {
    // Execute order for new entry only
    const calculatedCoins = newEntry.noOfCoins - order.noOfCoins;
    const satisfied = calculatedCoins >= 0;
    const prevCoins = newEntry.noOfCoins;

    // Executed coins update
    newEntry.executedCoins =
      newEntry.executedCoins +
      (satisfied ? order.noOfCoins : newEntry.noOfCoins);
    order.executedCoins =
      order.executedCoins + (satisfied ? order.noOfCoins : newEntry.noOfCoins);

    //  No of coins update
    newEntry.noOfCoins = satisfied ? calculatedCoins : 0;
    order.noOfCoins = satisfied ? 0 : Math.abs(calculatedCoins);

    // Order status update
    if (prevCoins !== newEntry.noOfCoins) {
      newEntry.status = (newEntry.noOfCoins
        ? "partiallyCompleted"
        : "completed") as unknown as executor.Status;
      order.status = (order.noOfCoins
        ? "partiallyCompleted"
        : "completed") as unknown as executor.Status;
      newEntry.orderFilledAt = newEntry.executedCoins
        ? new Date().getTime()
        : newEntry.orderFilledAt;
      order.orderFilledAt = order.executedCoins
        ? new Date().getTime()
        : newEntry.orderFilledAt;
    }
    return { executedNewEntry: newEntry, executedOrder: order };
  };

  // Update current market value
  updateMarket = (trade: executor.orderBook) => {
    const marketValue: executor.currentMarket = {
      price:
        trade.orderType < 3
          ? this.book.getSellerPrice()
          : this.book.getBuyerPrice(),
      high: this.book.currentMaximum().price,
      low: this.book.currentMinimum().price,
      volumne: this.book.priceVolumne(trade.price),
      timestamp: new Date().getTime(),
    };
    this.market.updateMarket(marketValue);
  };

  // Execute limit order
  execiteLimitOrder = () => {
    this.book.orderBook
      .filter(
        (order) =>
          orderTypes[order.orderType].includes("limit") &&
          order.status !== "completed" &&
          order.price <= this.market.getCurrentPrice().price
      )
      .forEach((order) => {
        const availablePrices =
          order.orderType < 3
            ? this.book.getSeller(order.price)
            : this.book.getBuyer(order.price);
        if (availablePrices.length) {
          availablePrices.forEach((otherOrder) => {
            const { executedNewEntry, executedOrder } = this.autualExecution(
              order,
              otherOrder
            );
            this.book.updateTrade(executedNewEntry);
            this.book.updateTrade(executedOrder);
          });
        }
      });
  };

  // Execute trade
  executeTrade = (trade: executor.trade, index: number) => {
    let newEntry: executor.orderBook = {
      ...trade,
      placedAt: new Date().getTime(),
      orderTypeDescription: orderTypes[trade.orderType],
      tradeId: btoa(JSON.stringify({ ...trade, index })),
      orderFilledAt: null,
      executedCoins: 0,
      side: trade.orderType < 3 ? "buy" : "sell",
      status: "pending",
      ...(orderTypes[trade.orderType].includes("market") && {
        price: this.market.getCurrentPrice().price,
      }),
    };
    const availablePrices =
      trade.orderType < 3
        ? this.book.getSeller(newEntry.price)
        : this.book.getBuyer(newEntry.price);
    if (
      availablePrices.length &&
      this.market.getCurrentPrice().price === newEntry.price
    ) {
      // Actual order execution for Market Order
      availablePrices.forEach((order) => {
        const { executedNewEntry, executedOrder } = this.autualExecution(
          newEntry,
          order
        );
        newEntry = executedNewEntry;
        // Update order Book
        this.book.updateTrade(executedOrder);
      });
      // Add new entry
      this.book.addTrade(newEntry);

      // Update market value
      this.updateMarket(newEntry);
    } else {
      // New entry only
      this.book.addTrade(newEntry);
      this.book.orderBook.length > 1 && this.updateMarket(newEntry);
    }
    // Limit order execution in progress
    this.execiteLimitOrder(); // need to verify is this unwanted
  };
}

// Order execution with trade loop
const executor = new Executor();
tradesList.forEach((trade, index) => executor.executeTrade(trade, index));
console.log(JSON.stringify(executor, null, 4));

export declare namespace executor {
  export interface trade {
    // cid: "BTC/USD"; Now single coin trade only
    coin: "BTC";
    pair: "USD";
    stopLimitPrice?: number;
    price: number;
    noOfCoins: number;
    orderType: 0 | 1 | 2 | 3 | 4 | 5;
  }
  export interface orderBook {
    tradeId: string;
    price: number;
    coin: "BTC";
    pair: "USD";
    orderType: 0 | 1 | 2 | 3 | 4 | 5;
    orderTypeDescription: orderDescription;
    placedAt: number;
    orderFilledAt: number | null;
    noOfCoins: number;
    executedCoins: number;
    side: "buy" | "sell";
    status: Status;
  }
  export interface currentMarket {
    price: number;
    high: number;
    low: number;
    volumne: number;
    timestamp: number;
  }
  export type Status =
    | "pending"
    | "partiallyCompleted"
    | "completed"
    | "cancelled";

  export type orderDescription =
    | "market buy"
    | "limit buy"
    | "stop-limit buy"
    | "market sell"
    | "limit sell"
    | "stop-limit sell";
}
