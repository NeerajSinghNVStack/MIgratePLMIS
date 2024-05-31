require('dotenv').config({ path: '.env' });
var express = require('express')
let app = express();
const PORT = 3000;
app.listen(PORT,()=>{
    console.log(`Server listining at PORT: ${PORT}`)
})