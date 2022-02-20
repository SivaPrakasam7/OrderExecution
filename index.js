"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const trades_json_1 = __importDefault(require("./trades.json"));
const tradesList = trades_json_1.default;
// Market trade logic
const orderTypes = [
    "market buy",
    "limit buy",
    "stop-limit buy",
    "market sell",
    "limit sell",
    "stop-limit sell",
];
// Current Market
class currentMarket {
    constructor() {
        // Get latest Market price
        this.getCurrentPrice = () => this.currentMarket[this.currentMarket.length - 1];
        // Update Market Price
        this.updateMarket = (value) => this.currentMarket.push(value);
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
}
// Order Books
class orderBooks {
    constructor() {
        // Update orderBook
        this.addTrade = (value) => this.orderBook.push(value);
        // Get minimum price
        this.currentMinimum = () => this.orderBook
            // .filter(({ executedCoins }) => executedCoins > 0)
            .reduce((prevOrder, currentOrder) => prevOrder.price < currentOrder.price ? prevOrder : currentOrder);
        // Get maximum price
        this.currentMaximum = () => this.orderBook
            // .filter(({ executedCoins }) => executedCoins > 0)
            .reduce((prevOrder, currentOrder) => prevOrder.price > currentOrder.price ? prevOrder : currentOrder);
        // Get Volumne of price
        this.priceVolumne = (price) => this.orderBook.filter((order) => order.price === price && order.executedCoins > 0).length;
        // Common finder
        this.finder = (price, side) => this.orderBook
            .filter((order) => order.side === side &&
            order.price === price &&
            order.status !== "completed")
            .sort((a, b) => a.noOfCoins - b.noOfCoins)
            .reverse();
        // Get Price Matches for Buy
        this.getSeller = (price) => this.finder(price, "sell");
        // Get Price Matches for Sell
        this.getBuyer = (price) => this.finder(price, "buy");
        // Get Min Price from Seller
        this.getOptimalSeller = () => this.orderBook
            .filter((order) => order.side === "sell")
            .reduce((prevOrder, currentOrder) => prevOrder.price < currentOrder.price ? prevOrder : currentOrder);
        // Get Max Price from Buyer
        this.getOptimalBuyer = () => this.orderBook
            .filter((order) => order.side === "buy")
            .reduce((prevOrder, currentOrder) => prevOrder.price > currentOrder.price ? prevOrder : currentOrder);
        // Get Common market price
        this.marketFinder = (side) => {
            const dubplicates = this.orderBook
                .filter((order) => order.side === side)
                .map(({ price }) => price)
                .reduce((cnt, cur) => ((cnt[cur] = cnt[cur] + 1 || 1), cnt), {});
            const values = Object.values(dubplicates);
            return +Object.keys(dubplicates)[values.indexOf(Math.max(...values))];
        };
        // Get Current Market Price from Seller
        this.getSellerPrice = () => this.marketFinder("sell");
        // Get Current Market Price from Buyer
        this.getBuyerPrice = () => this.marketFinder("buy");
        // Executed trade update
        this.updateTrade = (newOrder) => this.orderBook.map((order) => order.tradeId === newOrder.tradeId ? newOrder : order);
        this.orderBook = [];
    }
}
class Executor {
    constructor() {
        // Actual Execution of orders
        this.autualExecution = (newEntry, order) => {
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
                    : "completed");
                order.status = (order.noOfCoins
                    ? "partiallyCompleted"
                    : "completed");
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
        this.updateMarket = (trade) => {
            const marketValue = {
                price: trade.orderType < 3
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
        this.execiteLimitOrder = () => {
            this.book.orderBook
                .filter((order) => orderTypes[order.orderType].includes("limit") &&
                order.status !== "completed" &&
                order.price <= this.market.getCurrentPrice().price)
                .forEach((order) => {
                const availablePrices = order.orderType < 3
                    ? this.book.getSeller(order.price)
                    : this.book.getBuyer(order.price);
                if (availablePrices.length) {
                    availablePrices.forEach((otherOrder) => {
                        const { executedNewEntry, executedOrder } = this.autualExecution(order, otherOrder);
                        this.book.updateTrade(executedNewEntry);
                        this.book.updateTrade(executedOrder);
                    });
                }
            });
        };
        // Execute trade
        this.executeTrade = (trade, index) => {
            let newEntry = Object.assign(Object.assign(Object.assign({}, trade), { placedAt: new Date().getTime(), orderTypeDescription: orderTypes[trade.orderType], tradeId: btoa(JSON.stringify(Object.assign(Object.assign({}, trade), { index }))), orderFilledAt: null, executedCoins: 0, side: trade.orderType < 3 ? "buy" : "sell", status: "pending" }), (orderTypes[trade.orderType].includes("market") && {
                price: this.market.getCurrentPrice().price,
            }));
            const availablePrices = trade.orderType < 3
                ? this.book.getSeller(newEntry.price)
                : this.book.getBuyer(newEntry.price);
            if (availablePrices.length &&
                this.market.getCurrentPrice().price === newEntry.price) {
                // Actual order execution for Market Order
                availablePrices.forEach((order) => {
                    const { executedNewEntry, executedOrder } = this.autualExecution(newEntry, order);
                    newEntry = executedNewEntry;
                    // Update order Book
                    this.book.updateTrade(executedOrder);
                });
                // Add new entry
                this.book.addTrade(newEntry);
                // Update market value
                this.updateMarket(newEntry);
            }
            else {
                // New entry only
                this.book.addTrade(newEntry);
                this.book.orderBook.length > 1 && this.updateMarket(newEntry);
            }
            // Limit order execution in progress
            this.execiteLimitOrder(); // need to verify is this unwanted
        };
        this.market = new currentMarket();
        this.book = new orderBooks();
    }
}
// Order execution with trade loop
const executor = new Executor();
tradesList.forEach((trade, index) => executor.executeTrade(trade, index));
console.log(JSON.stringify(executor, null, 4));
