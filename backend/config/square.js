const { Client, Environment } = require('square');

// Initialize Square client
const squareClient = new Client({
  environment: process.env.SQUARE_ENVIRONMENT === 'production' 
    ? Environment.Production 
    : Environment.Sandbox,
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
});

// Get API instances
const paymentsApi = squareClient.paymentsApi;
const ordersApi = squareClient.ordersApi;
const customersApi = squareClient.customersApi;
const locationsApi = squareClient.locationsApi;
const refundsApi = squareClient.refundsApi;

module.exports = {
  squareClient,
  paymentsApi,
  ordersApi,
  customersApi,
  locationsApi,
  refundsApi,
  applicationId: process.env.SQUARE_APPLICATION_ID,
  locationId: process.env.SQUARE_LOCATION_ID
};
