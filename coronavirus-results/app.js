const serverless = require('serverless-http');
const express = require('express');
var mongoose = require('mongoose');

const app = new express();
let conn = null;
const { MONGO_DB_USERNAME, MONGO_DB_PASSWORD, MONGO_DB_ENDPOINT } = process.env;
const uri = `mongodb+srv://${MONGO_DB_USERNAME}:${MONGO_DB_PASSWORD}@${MONGO_DB_ENDPOINT}`;
let formattedData = [];

const resultsSchema = new mongoose.Schema({
  _id: { type: Number, required: true },
  notification_date: { type: Date, required: true },
  postcode: { type: Number, required: true },
  lhd_2010_code: { type: String, required: true },
  lhd_2010_name: { type: String, required: true },
  lga_code19: { type: Number, required: true },
  lga_name19: { type: String, required: true },
});

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
            mongoose.model('Results', resultsSchema);
        }
        
        const Results = conn.model('Results');
        
        const results = await Results.aggregate([
          {
            $group: {
              _id: '$notification_date',
              count: { $sum: 1 },
            },
          },
          {
            $addFields: { date: '$_id' },
          },
          {
            $sort: { _id: 1 },
          },
          {
            $project: { _id: 0 },
          },
        ]);
        formattedData = results;
        conn.close();
    }
      res.send(formattedData);
});

module.exports.lambdaHandler = serverless(app);
