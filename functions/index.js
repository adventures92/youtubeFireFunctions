const functions = require('firebase-functions');
const admin = require('firebase-admin');
const serviceAccount = require('./xor_fire_key.json');
const superCarge = require('superagent');
const express = require('express');
const bodyParser = require('body-parser');
const firebaseHelper = require('firebase-functions-helper');

const main = express();
const app = express();
const collectonName = 'xortech_app';

main.use('/v1', app);
main.use(bodyParser.json());
main.use(bodyParser.urlencoded({ extended: false }));

main.use((req, res) => {
    res.status(404).send({ 'error': 'page not found' });
});

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

exports.xortech = functions.https.onRequest(main);

var totalPages = 0;
app.get('/refresher', async (req, res) => {
    totalPages = 0;
    var result = await fetchYoutubeData();
    res.status(result['status_code']).send(result);
});

app.get('/fetch', async (req, res) => {

    var limit = req.query.limit;
    var page = req.query.page;

    if (limit === null || limit === '' || limit === undefined)
        limit = 20;
    if (page === null || page === '' || page === undefined)
        page = 1;


    if (page < 1) {
        sendErrorResponse(res, 'page should be equals to or greater that 1');
    }
    if (limit < 1) {
        sendErrorResponse(res, 'limit should be equals to or greater that 1');
    }

    try {
        var result = await getAllRecord(page, limit);
        res.send({
            'status_code': 200,
            'status': 'success',
            'totalItems': result.length,
            'result': result
        });
    } catch (err) {
        console.log(err);
        sendErrorResponse(res, err);
    }
});

// Live URL
const youtubeUrl = "https://www.googleapis.com/youtube/v3/search";

// Mock URL
//const youtubeUrl = "http://www.mocky.io/v2/5eca28d1300000492ca6cf1c"

async function fetchYoutubeData(nextPageToken) {
    totalPages++;
    var map = {
        'channelId': 'UCVoraDictyd89xgZt-J2Frw',
        'key': 'AIzaSyBE32cxibYFsP99j3P2sb9280W8_jdH0V8',
        'part': 'id,snippet',
        'maxResults': 50,
        'order': 'date'
    };
    if (nextPageToken !== null || nextPageToken === '')
        map['pageToken'] = nextPageToken;
    try {
        var resp = await (await superCarge.get(youtubeUrl).query(map)).body;
        await saveVideos(resp.items);
        if (resp.nextPageToken !== null || resp.nextPageToken === '') {
            return fetchYoutubeData(resp.nextPageToken)
        }
        return {
            'status': 'success',
            'status_code': 200,
            'messages': 'all videos updated successfully',
            'totalPage': totalPages,
            'totalVideos': resp.pageInfo.totalResults
        };

    } catch (err) {
        console.log(err);
        return {
            'status': 'failure',
            'status_code': 400,
            'error': err
        };
    }
}

function sendErrorResponse(resp, err) {
    resp.status(400).send({
        'status': 'failure',
        'status_code': 400,
        'error': err
    });
}

async function saveVideos(data) {
    for (var i = 0; i < data.length; i++) {
        var item = getDoucment(data[i]);
        var id = item['_id']
        if (await isDataExists(id))
            await updateDocument(id, item);
        else
            await createDocument(id, item);
    }
}

async function createDocument(id, item) {
    await firebaseHelper.firestore.createDocumentWithID(db, collectonName, id, item);
}

async function updateDocument(id, item) {
    await firebaseHelper.firestore.updateDocument(db, collectonName, id, item);
}

async function isDataExists(docId) {
    await firebaseHelper.firestore.checkDocumentExists(db, collectonName, docId);
}

async function getAllRecord(page, limit) {
    if (limit === null || page === null)
        return new Promise(() => Error('page or limit cannot be null'));

    page = parseInt(page);
    limit = parseInt(limit);

    var query = db.collection(collectonName)
        .where('kind', '==', 'youtube#video')
        .orderBy('publishedAt', 'desc')
        .limit(limit);

    if (page >= 2) {
        let off = (page - 1) * limit;
        query = query.offset(off);
    }

    var snapShot = await query.get();
    const results = [];
    snapShot.forEach(doc => {
        results.push(doc.data());
    });
    return results;
}

function getDoucment(item) {
    return {
        "_id": "" + item.etag,
        "kind": "" + item.id.kind,
        "videoId": "" + item.id.videoId,
        "channelId": "" + item.snippet.channelId,
        "channelTitle": "" + item.snippet.channelTitle,
        "title": "" + item.snippet.title,
        "description": "" + item.snippet.description,
        "thumbUrl": "" + item.snippet.thumbnails.high.url,
        "publishedAt": new Date(item.snippet.publishedAt)
    };
}

