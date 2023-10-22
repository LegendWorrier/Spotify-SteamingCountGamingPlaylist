"use strict"
const puppeteer = require("puppeteer")
const googlesheet = require("../controller/googlesheet")
let con = null

async function getSteamCount(music, browser, playlist_id) {
	// artist song page
	const artists = music.track.artists
	const music_id = music.track.id
	const playlist_selector = `spotify:playlist:${playlist_id}`	
	let steamCount = '0'

	for(let i = 0; i < artists.length; i++) {
		const artistPage = await browser.newPage()
		try{
			const pageUrl = `https://artists.spotify.com/c/artist/${artists[i]['id']}/song/${music_id}/playlists?time-filter=1day`			
			await artistPage.goto(pageUrl, { waitUntil: "networkidle0", timeout: 0 })
			if(await artistPage.$(`tr[aria-label='${playlist_selector}']`) !== null) {
				await artistPage.waitForSelector(`tr[aria-label='${playlist_selector}']`)
				steamCount = await artistPage.evaluate((playlist_selector) => {
					const list = document.querySelectorAll(`tr[aria-label='${playlist_selector}'] td`)
					return list[2].title
				}, playlist_selector)
				artistPage.close()
				break
			} else {			
				artistPage.close()
			}
		} catch(e) {
			artistPage.close()
			return steamCount
		}
	}

	return steamCount
}

const getCurrentDate = () => {
	let date_ob = new Date()	
    date_ob.setDate(date_ob.getDate() - 1)
	let date = ("0" + date_ob.getDate()).slice(-2)	
	let month = ("0" + (date_ob.getMonth() + 1)).slice(-2)
	let year = date_ob.getFullYear()
	return date + '/' + month + '/' + year
}

const getNearestSteamCount = (musiclist, index) => {
	for(let i = index + 1; i < musiclist.length; i++) {
		if(musiclist[i]['steamCount'] !== '0') {
			return i;
		}		
	}
	return index + 1
}

function run_dbQuery(query, params) {
	return new Promise(function(resolve, reject) {
		con.query(query, params, function(err, result, fields) {
			if(err) {
				reject(err)
			} else {
				resolve(result)
			}
		});
	});
}

async function storeSteamData(data, id) {
	var len = data.length;
	
	for(let i = 0; i < len; i++) {
		let item = data[i];

		try {
			let result1 = await run_dbQuery('SELECT * FROM music WHERE music_id=? AND playlist_id=?  limit 1', [item.track.id, id])

			if(result1.length < 1) {
				let result2 = await run_dbQuery(
					"INSERT INTO music (playlist_id, music_id, music_title, music_order) VALUES(?, ?, ?, ?)", 
					[id, item.track.id, item.track.name, i+1]
				)

				try {
					let result3 = await run_dbQuery(
						"INSERT INTO steam_count (music_id, created_date, steamCount) VALUES(?, ?, ?)", 
						[result2.insertId, getCurrentDate(), item.steamCount]
					)
				}  catch(error) {
					console.log(error)
					return false;
				}

			} else {
				let result2 = await run_dbQuery(
					"UPDATE music SET music_order=? WHERE music_id=? AND playlist_id=?", 
					[i+1, item.track.id, id]
				)

				let result3 = await run_dbQuery(
					"SELECT * FROM steam_count WHERE music_id = ? AND created_date = ?", 
					[result1[0].id, getCurrentDate()]
				)

				if(result3.length < 1) {
					let result4 = await run_dbQuery(
						"INSERT INTO steam_count (music_id, created_date, steamCount) VALUES(?, ?, ?)", 
						[result1[0].id, getCurrentDate(), item.steamCount]
					)
				} else {
					let result4 = await run_dbQuery(
						"UPDATE steam_count SET steamCount=? WHERE music_id=? AND created_date=?", 
						[item.steamCount, result1[0].id, getCurrentDate()]
					)
				}
				
			}
			
		} catch (error) {
			console.log(error);
			return false;
		}
	}

	return true;

}

module.exports.doScrape = async function(db, musiclist, id, playlist_id, securityDetail) {
	con  = db
	const browser = await puppeteer.launch({ headless: false })
	// login page
	const loginPage = await browser.newPage()
	await loginPage.goto("https://accounts.spotify.com/en/login?continue=https:%2F%2Fartists.spotify.com%2F", { waitUntil: "networkidle0", timeout: 0 })		
	await loginPage.click("#login-username")
	await loginPage.keyboard.type(securityDetail.email)   //email
	await loginPage.click("#login-password")
	await loginPage.keyboard.type(securityDetail.password)         //password
	await loginPage.click("#login-button")
	await loginPage.waitForNavigation()

	for(let i = 0; i < musiclist.length; i++) {
		let count = await getSteamCount(musiclist[i], browser, playlist_id)		
		musiclist[i]['steamCount'] = count.replace(',', '')
	}

	await browser.close()

	for(let i = 1; i < musiclist.length - 1; i++) {
		if(musiclist[i]['steamCount'] == '0') {
			let pos = getNearestSteamCount(musiclist, i)
			musiclist[i]['steamCount'] = Math.ceil((musiclist[i - 1]['steamCount'] * 1 + musiclist[pos]['steamCount'] * 1) / 2)
			musiclist[i]['steamCount'] = musiclist[i]['steamCount'].toString()			
		}
	}	

	const flag = await storeSteamData(musiclist, id)
	if(flag) {	
		googlesheet.store(con, id, playlist_id)
	};
}