var mongoose = require('mongoose');
const csv = require('csvtojson');
const fetch = require('node-fetch');

const { MONGO_DB_USERNAME, MONGO_DB_PASSWORD, MONGO_DB_ENDPOINT } = process.env;
const mongoUri = `mongodb+srv://${MONGO_DB_USERNAME}:${MONGO_DB_PASSWORD}@${MONGO_DB_ENDPOINT}`;

dataUrl = 'https://raw.githubusercontent.com/'
dataUri = 'CSSEGISandData/COVID-19/master/csse_covid_19_data/csse_covid_19_time_series/time_series_covid19_confirmed_global.csv'

const confirmedCasesSchema = new mongoose.Schema({
  country: { type: String, required: false },
  state: { type: String, required: false },
  timeseries: { type: Array, required: false },
}, { strict: false });

function formatSubscribedData(jsonObj) {
  return {
    // Remove any characters that are not a letter from the Country name
    country: jsonObj['Country/Region'].replace(/[^a-zA-Z]/g, ''),
    state: jsonObj['Province/State'],
    timeseries: Object.keys(jsonObj)
      .filter(key => Date.parse(key))
      .map(key => ({ date: new Date(key).toISOString(), value: parseInt(jsonObj[key])}))
    };
}

async function createMongooseConnection(uri) {
  conn = mongoose.createConnection(uri, {
    bufferCommands: false,
    bufferMaxEntries: 0,
    useNewUrlParser: true,
    useUnifiedTopology: true,
    socketTimeoutMS: 100000,
  });
  mongoose.model('ConfirmedCases', confirmedCasesSchema);
  return await conn;
}

function updateStateData(stateData, Cases, childPromise) {
  return Cases.collection.findOneAndUpdate(
    {country: stateData.country, state: stateData.state},
    {$set: {timeseries: stateData.timeseries}},
    {returnOriginal: false, upsert: true},
    (err, res) => {
      if (err) console.log('update error: ', err)
      childPromise(res);
    }
  );
}

exports.handler = async (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;

  let conn = await createMongooseConnection(mongoUri);
  let ConfirmedCases = conn.model('ConfirmedCases');

  let promises = [];

  try {
    return new Promise((parentPromise) => {
      fetch(`${dataUrl}${dataUri}`)
        .then(response => {
          csv()
            .fromStream(response.body)
            .subscribe((jsonObj) => {
              const stateData = formatSubscribedData(jsonObj);          
              if (stateData) {
                promises = promises.concat(new Promise((childPromise) => {
                  return updateStateData(stateData, ConfirmedCases, childPromise);
                }));
              }
            },
            () => console.log('subscribe error'),
            () => {
              const res = Promise.all(promises);
                res.then((response) => {
                  response.forEach(res => console.log(res && res.value ? `${res.value.state} updated` : res));
                  conn.close();
                  parentPromise()
                });
            });
        });
      });
    } catch (err) {
    console.error(`Upload ConfirmedCases error: ${err}`);
  }
};
