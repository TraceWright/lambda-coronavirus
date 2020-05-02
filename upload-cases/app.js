var mongoose = require('mongoose');
const csv = require('csvtojson');
const fetch = require('node-fetch');

const { MONGO_DB_USERNAME, MONGO_DB_PASSWORD, MONGO_DB_ENDPOINT } = process.env;
const mongoUri = `mongodb+srv://${MONGO_DB_USERNAME}:${MONGO_DB_PASSWORD}@${MONGO_DB_ENDPOINT}`;

dataUrl = 'https://raw.githubusercontent.com/'
dataUri = 'CSSEGISandData/COVID-19/master/csse_covid_19_data/csse_covid_19_time_series/time_series_covid19_confirmed_global.csv'

const casesSchema = new mongoose.Schema({
  state: { type: String, required: false },
  timeseries: { type: Array, required: false },
}, { strict: false });

function formatAustralianData(jsonObj) {
  return jsonObj
    .filter(jsonEl => isAustralianData(jsonEl))
    .map(state => (
      { state: state['Province/State'],
        timeseries: Object.keys(state)
          .filter(key => Date.parse(key))
          .map(key => ({ date: new Date(key).toISOString(), value: state[key]}))
      }
    ));
}

function formatSubscribedAustralianData(jsonObj) {
  return { 
    state: jsonObj['Province/State'],
    timeseries: Object.keys(jsonObj)
      .filter(key => Date.parse(key))
      .map(key => ({ date: new Date(key).toISOString(), value: jsonObj[key]}))
    };
}

function isAustralianData(data) {
  return data['Country/Region'] === 'Australia';
}

async function createMongooseConnection(uri) {
  conn = mongoose.createConnection(uri, {
    bufferCommands: false,
    bufferMaxEntries: 0,
    useNewUrlParser: true,
    useUnifiedTopology: true,
    socketTimeoutMS: 100000,
  });
  mongoose.model('Cases', casesSchema);
  return await conn;
}

function updateStateData(stateData, Cases, childPromise) {
  return Cases.collection.findOneAndUpdate(
    {state: stateData.state},
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
  let Cases = conn.model('Cases');

  let promises = [];

  try {
    return new Promise((parentPromise) => {
      fetch(`${dataUrl}${dataUri}`)
        .then(response => {
          csv()
            .fromStream(response.body)
            .subscribe((jsonObj) => {
              const stateData = isAustralianData(jsonObj) 
                ? formatSubscribedAustralianData(jsonObj)
                : null;
          
              if (stateData) {
                promises = promises.concat(new Promise((childPromise) => {
                  return updateStateData(stateData, Cases, childPromise);
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


    // fetch(`${dataUrl}${dataUri}`)
    //   .then(response => {
    //     csv()
    //     .fromStream(response.body)
    //       .then(async (jsonObj) => {

    //         const ausData = formatAustralianData(jsonObj);

    //         // // drop collection then insert data
    //         // if (await (await conn.db.listCollections({name: 'cases'}).toArray()).length) {
    //         //   await Cases.collection.drop();
    //         // }
    //         // await Cases.collection.insertMany(ausData);
    //         // conn.close();
    //         // parentPromise();

    //         // update timeseries data
    //         promises = await ausData.map(stateData => {
    //           return new Promise((childPromise) => { 
    //             updateStateData(stateData, Cases, childPromise);
    //           });
    //         });

    //         const res = Promise.all(promises);
    //         res.then((response) => {
    //           response.forEach(res => console.log(res && res.value ? `${res.value.state} updated` : res));
    //           conn.close();
    //           parentPromise();
    //         });

    //       }
    //     );
    //   });
  
      });
    } catch (err) {
    console.error(`Upload cases error: ${err}`);
  }
  console.log('after catch');
};
