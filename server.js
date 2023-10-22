const express = require("express")
const bodyParser = require("body-parser")
const cron = require('node-cron')
const scrape = require("./controller/scrapper")
const request = require('request')
const axios = require('axios')
const mysql = require('mysql')

const client_id = '46e65d19af1244caaa96a08d9ffb2520' // Your client id
const client_secret = 'bfe3bb7590494ae3a990ab2c4f1309e4' // Your secret

let playlist_ids = []
let securityDetail
let intervalObj
let current = 0

const con = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "spotify"
})

const getCurrentDate = () => {
	let date_ob = new Date()	
    date_ob.setDate(date_ob.getDate() - 1)
	let date = ("0" + date_ob.getDate()).slice(-2)	
	let month = ("0" + (date_ob.getMonth() + 1)).slice(-2)
	let year = date_ob.getFullYear()
	return date + '/' + month + '/' + year
}

const getMusics = async (token, id, playlist_id, securityDetail) => {
    let musiclist = []
    try {
        let config = {
            method: 'get',
            url: `https://api.spotify.com/v1/playlists/${playlist_id}/tracks?market=ES&fields=total%2Citems(track(id%2Cname%2Cartists(id%2C%20name)))&offset=0`,
            headers: {
              'Authorization': 'Bearer ' + token
            }
        }
        
        const firstObj = await axios(config)
        const { total, items } = firstObj.data        
        const len = Math.ceil(total / 100)    
        musiclist = [...musiclist, ...items]

        for(let i = 1; i < len; i++) {
            let offset = 100 * i
            config = {
                method: 'get',
                url: `https://api.spotify.com/v1/playlists/${playlist_id}/tracks?market=ES&fields=items(track(id%2Cname%2Cartists(id%2C%20name)))&offset=${offset}`,
                headers: {
                  'Authorization': 'Bearer ' + token
                }
            }

            const obj = await axios(config)
            musiclist = [...musiclist, ...obj.data.items]         
        }

        config = {
            method: 'get',
            url: `https://api.spotify.com/v1/playlists/${playlist_id}`,
            headers: {
              'Authorization': 'Bearer ' + token
            }
        }

        const playlist_obj = await axios(config)
        const followCount = playlist_obj.data.followers.total

        con.query("SELECT * FROM follow_count WHERE playlist_id = ? AND follow_date = ?", [id, getCurrentDate()], function(err, playlistObj, fileds) {
            if (err) throw err
            if(playlistObj.length < 1) {
                con.query('INSERT INTO follow_count (playlist_id, follow_date, followCount) VALUES(?, ?, ?)', [id, getCurrentDate(), followCount], function(err, result, fields) {
                    if (err) throw err
                    console.log('created')
                    scrape.doScrape(con, musiclist, id, playlist_id, securityDetail)
                })
            } else {
                con.query('UPDATE follow_count SET followCount=? WHERE playlist_id=? AND follow_date=?', [followCount, id, getCurrentDate()], function(err, result, fields) {
                    if (err) throw err
                    console.log('updated')
                    scrape.doScrape(con, musiclist, id, playlist_id, securityDetail)
                })                
            }
        })

    } catch (error) {
        console.error(error)
    }
}

// const app = express()
// app.use(bodyParser.json())

// const port = process.env.PORT || 5006
// app.listen(port, () => console.log("Server started on port " + port))

const startScraping = (id, playlist_id, securityDetail) => {
    // Request to get the auth token
    request.post(authOptions, function(error, response, body) {
        if (!error && response.statusCode === 200) {
            const token = body.access_token
            getMusics(token, id, playlist_id, securityDetail)
        }
    })
}

//authorization requests
const authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    headers: {
      'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
    },
    form: {
      grant_type: 'client_credentials'
    },
    json: true
}

con.connect(function(err) {
    if (err) throw err    
    console.log('db connected')
    con.query(`SELECT * FROM playlist`, function (err, result, fields) {
        if (err) throw err
        playlist_ids = result
        con.query('SELECT * FROM detail limit 1', function(err, result, fields) {
            securityDetail = result[0]
            startScraping(playlist_ids[current].id, playlist_ids[current].playlist, securityDetail)
            
            intervalObj = setInterval(() => {
                current += 1
                startScraping(playlist_ids[current].id, playlist_ids[current].playlist, securityDetail)                

                // Clear interval
                if(playlist_ids.length <= current + 1)  {
                    current = 0
                    clearInterval(intervalObj)      
                }                               
            }, 180000)
        })
    })
})

// cron.schedule('0 13 * * *', function() {
//     con.connect(function(err) {
//     if (err) throw err    
//         console.log('db connected')
//         con.query(`SELECT * FROM playlist`, function (err, result, fields) {
//             if (err) throw err
//             playlist_ids = result
//             con.query('SELECT * FROM detail limit 1', function(err, result, fields) {
//                 securityDetail = result[0]
//                 startScraping(playlist_ids[current].id, playlist_ids[current].playlist, securityDetail)
                
//                 intervalObj = setInterval(() => {
//                     current += 1
//                     startScraping(playlist_ids[current].id, playlist_ids[current].playlist, securityDetail)                

//                     // Clear interval
//                     if(playlist_ids.length <= current + 1)  {
//                         current = 0
//                         clearInterval(intervalObj)      
//                     }                               
//                 }, 180000)
//             })
//         })
//     })
// })