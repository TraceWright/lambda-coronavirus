const serverless = require('serverless-http');
const express = require('express');
var mongoose = require('mongoose');

const app = new express();
let conn = null;
const { MONGO_DB_USERNAME, MONGO_DB_PASSWORD, MONGO_DB_ENDPOINT } = process.env;
const uri = `mongodb+srv://${MONGO_DB_USERNAME}:${MONGO_DB_PASSWORD}@${MONGO_DB_ENDPOINT}`;
let formattedData = [];

const confirmedCasesSchema = new mongoose.Schema({
  country: { type: String, required: false },
  state: { type: String, required: false },
  timeseries: { type: Array, required: false },
}, { strict: false });

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
        }
        
        const ConfirmedCases = conn.model('ConfirmedCases');
        
        const cases = await ConfirmedCases.aggregate([
          {  $unwind: "$timeseries" },
          {
            $group: {
              _id: {country: "$country", date: "$timeseries.date"},
              value:{$sum:"$timeseries.value"}
            }
          },
          {
            $sort: {
              "_id.date": 1,
              "_id.country": 1
            }
          },
          { 
            $group: {
              _id: "$_id.country",  
              timeseries:{ $push:
                {
                  date:"$_id.date",
                  value:"$value"
                }
              },  
            }
          },
          {
            $addFields: {
              location: "$_id"
            }
          },
          {
            $project: {
              _id: 0
            }
          }
        ]);
        formattedData = formatData(cases);
        conn.close();
    }
      res.send(formattedData);
});

module.exports.lambdaHandler = serverless(app);
