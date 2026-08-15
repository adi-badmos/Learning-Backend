import dotenv from 'dotenv';
import connectDB from "./db/index.js"
import express from 'express';
const app = express();

dotenv.config({
    path: './env'
});

// database se jb bhi baat kro => try-catch lgao and async-await ka dhyan rkho
connectDB();