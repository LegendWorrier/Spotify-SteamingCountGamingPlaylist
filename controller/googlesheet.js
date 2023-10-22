const {google} = require('googleapis')
const keys = require('../keys.json')
const gsapi = google.sheets({ version: 'v4'})

const client = new google.auth.JWT(
    keys.client_email,
    null,
    keys.private_key,
    ['https://www.googleapis.com/auth/spreadsheets'],
    null
)

function runGSOperate(cl, values, title) {

    var addOpt = {
        spreadsheetId: keys.spreadsheetId,
        auth: cl,
        resource: {
            data: [
                {   
                    range: title,
                    majorDimension: 'ROWS',
                    values: values,                    
                }
            ],
            valueInputOption: 'RAW',            
        },
    }

    gsAddData(addOpt)
}

async function gsClearData(opt, client, finalData, title) {
    try {
        let data = await gsapi.spreadsheets.values.clear(opt)
        console.log('sheet1 was cleared!')
        runGSOperate(client, finalData, title)
        runGSOperate(client, finalData, title)
        runGSOperate(client, finalData, title)
    } catch(error) {
        console.log(error)
    }
}


async function gsAddData(opt) {
    try {
        let data = await gsapi.spreadsheets.values.batchUpdate(opt)
        console.log('data was added to sheet1')
    } catch(error) {
        console.log(error)
    }
}

const getSteamCountData = (con, id, playlist_id) => {    
    con.query('SELECT * FROM steam_count INNER JOIN music ON steam_count.`music_id` = music.`id` AND music.`playlist_id` = ? ORDER BY LENGTH(music.`music_order`), music.`music_order`', [id], function (err, data, fields) {        
        if (err) throw err
        con.query('SELECT created_date FROM steam_count GROUP BY created_date ORDER BY id DESC', function (err, datelist, fields) {
            if (err) throw err
            con.query('SELECT title FROM playlist WHERE id = ?', [id], function (err, result, fields) {
                if (err) throw err
                con.query("SELECT * FROM follow_count WHERE playlist_id = ? ORDER BY str_to_date(`follow_date`, '%d/%m/%Y') DESC", [id], function(err, follows, fields) {
                    title = result[0].title
                    storeOnGoogleSheet(data, datelist, title, follows)
                })                
            })            
        })        
    })
}

const storeOnGoogleSheet = (data, datelist, title, follows) => {
    let steamData = []
    let followData = []

    data.forEach(ele => {       
        if(typeof steamData[ele['music_order'] - 1] == 'undefined') {
            steamData[ele['music_order'] - 1] = new Object()
        }
        steamData[ele['music_order'] - 1]['title'] = ele['music_title']
        datelist.forEach((date, idx) => {
            if(date['created_date'] == ele['created_date']) {
                steamData[ele['music_order'] - 1][date['created_date']] = ele['steamCount']
            }          
        })        
    })
    
    followData.push('Follow Count')
    follows.forEach((ele, index) => {
        datelist.forEach(date => {          
            if(date['created_date'] == ele['follow_date']) {
                if(index == follows.length - 1) {
                    followData.push(ele['followCount'])
                } else {
                    followData.push(ele['followCount'] - follows[index + 1]['followCount'])
                }                
            }          
        })        
    })

    let finalData = []
    let header = [], space = [];
    header.push('Music Title')
    space.push('')
    datelist.forEach(date => {
        header.push(date.created_date)
        space.push('')
    })

    finalData.push(header)
    finalData.push(space)

    let totalObj = new Object()

    steamData.forEach(ele => {
        let temp = []
        temp.push(ele.title.toString())
        datelist.forEach((date, idx) => {
            if(typeof totalObj[date['created_date']] == 'undefined') {
                totalObj[date['created_date']] = 0
            }
            if(typeof ele[date['created_date']] == 'undefined') {
                ele[date['created_date']] = ''
                temp.push('')
                totalObj[date['created_date']] += 0
            } else {
                temp.push(ele[date['created_date']])
                totalObj[date['created_date']] += ele[date['created_date']] * 1
            }
        })
        finalData.push(temp)
    })

    let totalRow = []
    totalRow.push('Total Steam Count')
    datelist.forEach((date, idx) => {
        totalRow.push(totalObj[date['created_date']].toString())
    })

    finalData.splice(2, 0, followData)
    finalData.splice(3, 0, totalRow)
    finalData.splice(4, 0, space)

    client.authorize(function(err, tokens) {
        if(err) {
            console.log(err)
            return
        } else {
            console.log('Connected!')  
            // clear existing sheet
            var clearOpt = {
                spreadsheetId: keys.spreadsheetId,
                auth: client,
                range: title
            }

            gsClearData(clearOpt, client, finalData, title) 
            
        }
    })
}

module.exports.store = async function(con, id, playlist_id) {    
    getSteamCountData(con, id, playlist_id)
}