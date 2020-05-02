const serverless = require('serverless-http');
const express = require('express');
var mongoose = require('mongoose');

const app = new express();
let conn = null;
const { MONGO_DB_USERNAME, MONGO_DB_PASSWORD, MONGO_DB_ENDPOINT } = process.env;
const uri = `mongodb+srv://${MONGO_DB_USERNAME}:${MONGO_DB_PASSWORD}@${MONGO_DB_ENDPOINT}`;
let formattedData = [];

const casesSchema = new mongoose.Schema({
  state: { type: String, required: false },
  timeseries: { type: Array, required: false },
}, { strict: false });


function formatData(data) { 
  return data.flatMap((element) => {
    const { state, timeseries } = element;
    return timeseries.map((el) => ({
      name: state, value: el.value, date: el.date, category: state,
    }));
  });
}

app.get('/', async (req, res) => {
    if (!formattedData.length) {
        if (conn == null) {
            conn = mongoose.createConnection(uri, {
            bufferCommands: false,
            bufferMaxEntries: 0,
            useNewUrlParser: true,
            useUnifiedTopology: true,
            });
            await conn;
            mongoose.model('Cases', casesSchema);
        }
        
        const Cases = conn.model('Cases');
        
        const cases = await Cases.find({});
        formattedData = formatData(cases);
        conn.close();
    }
      res.send(formattedData);
});

module.exports.lambdaHandler = serverless(app);
