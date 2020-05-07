const serverless = require('serverless-http');
const express = require('express');
var mongoose = require('mongoose');

const app = new express();
let conn = null;
const { MONGO_DB_USERNAME, MONGO_DB_PASSWORD, MONGO_DB_ENDPOINT } = process.env;
const uri = `mongodb+srv://${MONGO_DB_USERNAME}:${MONGO_DB_PASSWORD}@${MONGO_DB_ENDPOINT}`;
let formattedData = [];
let config = {};

const confirmedCasesSchema = new mongoose.Schema({
  country: { type: String, required: false },
  state: { type: String, required: false },
  timeseries: { type: Array, required: false },
}, { strict: false });

const chartConfigSchema = new mongoose.Schema({
  location: { type: String, required: true },
  numberOfBars: { type: Number, required: false },
}, { strict: false });

function removeZeroDateValues(data) {
  const firstDate = data[0].timeseries[0].date;
  const firstDates = data.flatMap((el) => el.timeseries.filter(e => e.date === firstDate));
  return firstDates.every((el) => el.value === 0)
    ? { isEveryFirstDateZero: true,
        data: data.map((el) => {
          const timeseries = el.timeseries.filter(e => e.date !== firstDate);
          return {location: el.location, timeseries};
        })}
    : { isEveryFirstDateZero: false, data };
}

function cleanData(data) {
  if (data.length > 0) {
    let isEveryFirstDateZero = true;
    let cleanedData = data;
    while (isEveryFirstDateZero) {
      const result = removeZeroDateValues(cleanedData);
      isEveryFirstDateZero = result.isEveryFirstDateZero;
      cleanedData = result.data;
    }
    return cleanedData;
  } else {
    console.error('cleanData(): Data error');
  }
}

function formatData(data) { 
  return data.flatMap((element) => {
    const { location, timeseries } = element;
    return timeseries.map((el) => ({
      name: location, value: el.value, date: el.date, category: location,
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
            mongoose.model('ConfirmedCases', confirmedCasesSchema);
            mongoose.model('ChartConfigurations', chartConfigSchema);
        }
        
        const ConfirmedCases = conn.model('ConfirmedCases');
        const ChartConfig = conn.model('ChartConfigurations');
        
        const cases = await ConfirmedCases.aggregate([
          {
            $match: { country: "Australia" }
          },
          {
            $addFields: { location: '$state' }
          },
          {
            $project: { _id: 0, country: 0, state: 0 }
          }
        ]);

        const cleanedData = cleanData(cases);
        formattedData = formatData(cleanedData);
        config = await ChartConfig.findOne({location: 'australia'}).select({numberOfBars: 1, _id: 0});
        conn.close();
    }
      res.send({data: formattedData, config});
});

module.exports.lambdaHandler = serverless(app);
