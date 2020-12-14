const path = require('path');
const express = require('express');
const fileUpload = require('express-fileupload');
const app = express();

const bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(fileUpload());
app.use(express.static('nuxpert/build'));

// send the frontend bundle to the user
app.get('/', function(req, res) {
    res.sendFile(path.join(__dirname, 'nuxpert','build', 'index.html'));
});

app.get('/result', function(req, res) {
    res.sendFile(path.join(__dirname, 'nuxpert','build', 'index.html'));
});

app.get('/credit', function(req, res) {
    res.sendFile(path.join(__dirname, 'nuxpert','build', 'index.html'));
});

app.get('/search/:keyword', function(req, res) {
    res.sendFile(path.join(__dirname, 'nuxpert','build', 'index.html'));
});

app.get('/login', function(req, res) {
    res.sendFile(path.join(__dirname, 'nuxpert','build', 'index.html'));
});

app.get('/history', function(req, res) {
    res.sendFile(path.join(__dirname, 'nuxpert','build', 'index.html'));
});

// Google API
// Imports the Google Cloud client library
// referenced page: https://cloud.google.com/nodejs/docs/reference/vision/0.24.x/
const vision = require('@google-cloud/vision');
// Creates a GCP vision client
const client = new vision.ImageAnnotatorClient();
// google-cloud storage
// referenced page: https://cloud.google.com/nodejs/docs/reference/storage/2.3.x/
const {Storage} = require('@google-cloud/storage');
// Creates a gcp storage client
const storage = new Storage();
// The name for the bucket
const bucketName = 'nuxpert';
const public_access_url = `http://storage.googleapis.com/${bucketName}/`


var Nutrient = (function(){
    return function item(nutrient){
        this.name = nutrient.name;
        this.details = nutrient.details;
    };
}());

// security dependency
const cookie = require('cookie');
const crypto = require('crypto');

function generateSalt (){
    return crypto.randomBytes(16).toString('base64');
}

function generateHash (password, salt){
    var hash = crypto.createHmac('sha512', salt);
    hash.update(password);
    return hash.digest('base64');
}

const session = require('express-session');
app.use(session({
    secret: 'nuxpertinfo',
    resave: false,
    saveUninitialized: true,
}));
app.use(function (req, res, next){
    req.username = ('user' in req.session)? req.session.user.username : null;
    console.log("HTTP request", req.method, req.url, req.body);
    console.log(`SessionID: ${req.sessionID}`);
    if(req.session.user) console.log(`Session.user.username:  ${req.session.user.username}`);
    next();
});

let isAuthenticated = function(req, res, next) {
    if (!req.username) return res.status(401).end("access denied");
    res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, DELETE, TRACE, OPTIONS, PATCH");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Credentials","true");
    next();
};

// mongodb dependency
// referenced page: http://mongodb.github.io/node-mongodb-native/2.0/api/
let mongoClient = require('mongodb').MongoClient;
let ObjectId = require('mongodb').ObjectID;
let dbUrl = "mongodb+srv://conner:8G0BOdeTu2gzNLyb@mongo-r9zv2.gcp.mongodb.net/test?retryWrites=true";

// other dependencies
const multer  = require('multer');
let upload = multer({ dest: 'uploads/' });
const fs = require('fs');
const Fuse = require('fuse.js');

// make pdf part
const pdfMake = require("./node_modules/pdfmake/build/pdfmake.js");
const pdfFonts = require("./node_modules/pdfmake/build/vfs_fonts.js");
pdfMake.vfs = pdfFonts.pdfMake.vfs;
// referenced page: https://github.com/bpampuch/pdfmake/blob/0.1/dev-playground/server.js
// create the pdf file
app.get('/api/report/make/:imageid/', isAuthenticated, function (req, res, next) {
    // initialize the docDefinition
    var docDefinition = {
        content: [
        ]
    };
    // get the imageId from the request URL
    let id = req.params.imageid;
    mongoClient.connect(dbUrl, {useNewUrlParser: true}, function(err, db) {
        if (err) return res.status(500).end("Oppps!Serer side error!");
        // get two collections
        let images = db.db('cscc09').collection('images');
        let nutrients = db.db('cscc09').collection('nutrients');
        // find the image details from the given imageId
        images.findOne({_id: ObjectId(id)}, {projection: {result: 1}}, function(err, image) {
            let results = image.result;
            // retrive all the nutrients from the db to filter out those the image has
            nutrients.find().project({_id: 0, name: 1, details: 1}).toArray(function(err, nutrients_lst) {
                db.close();
                // traverse the all the nutrients to match
                nutrients_lst.forEach(function(nutrient) {
                    if(results.indexOf(nutrient.name) != -1){
                        docDefinition.content.push(`${nutrient.name}: `);
                        docDefinition.content.push(`    ${nutrient.details}\n\n`);
                    }
                });
                // generate pdf corresponding to the docDefinition
                const pdfDoc = pdfMake.createPdf(docDefinition);
                pdfDoc.getBase64((data) => {
                    // convert the pdf to base64-encoded
                    const base64Data = Buffer.from(data.toString('utf-8'), 'base64');
                    let local_path = `uploads/${req.params.imageid}.pdf`;
                    // generate the local temp file
                    fs.writeFile(local_path, base64Data, 'base64', function(err) {
                        if(err) return res.status(500).end("Oppps!Serer side error!");
                    });
                    // upload the file to the cloud bucket
                    let bucket_path = `${req.username}/tempPdf/${req.params.imageid}.pdf`;
                    storage.bucket(bucketName).upload(local_path, {
                        destination: bucket_path,
                        metadata: {
                        // Enable long-lived HTTP caching headers
                        // Use only if the contents of the file will never change
                        // (If the contents will change, use cacheControl: 'no-cache')
                        cacheControl: 'public, max-age=31536000',
                        },
                    })
                    .then(() => {
                        fs.unlink(local_path, (err) => {
                            if (err) return res.status(500).end("Oppps!Serer side error!");
                            console.log(`${local_path} was deleted`);
                            console.log(`${bucket_path} uploaded to ${bucketName}.`);
                            let result = {};
                            result['url'] = `${public_access_url}${bucket_path}`;
                            let url = `${public_access_url}${bucket_path}`;
                            res.setHeader("Access-Control-Allow-Credentials","true");
                            res.end(url)
                        });
                    })
                    .catch(err => {
                        return res.status(500).end("Oppps!Serer side error!");
                    });
                });
            });
        });
    });
});

// save the pdf file
app.get('/api/report/save/:imageid/', isAuthenticated, function (req, res, next) {
    // upload the file to the cloud bucket
    let local_path = `uploads/${req.params.imageid}.pdf`;
    let org_bucket_path = `${req.username}/tempPdf/${req.params.imageid}.pdf`;
    let des_bucket_path = `${req.username}/${req.params.imageid}.pdf`;
    storage.bucket(bucketName).file(org_bucket_path).copy(des_bucket_path)
    .then(() => {
        console.log(`${org_bucket_path} copied to ${des_bucket_path}.`);
        // insert the saved pdf info
        mongoClient.connect(dbUrl, {useNewUrlParser: true}, function(err, db) {
            if (err) return res.status(500).end("Oppps!Serer side error!");
            let reports = db.db('cscc09').collection('reports');
            let images =  db.db('cscc09').collection('images'); 
            images.findOne({_id: ObjectId(req.params.imageid)}, {projection: {_id: 0, path: 1}}, function(err, image) {
                let image_path = image.path;
                reports.updateOne({path: des_bucket_path},{ $set: {path: des_bucket_path, username: req.username, imageid: req.params.imageid, imagePath: image_path}}, {upsert: true}, function(err){
                    if (err) return res.status(500).end("Oppps!Serer side error!");
                    db.close();
                    res.setHeader("Access-Control-Allow-Credentials","true");
                    return res.status(200).end(`The file ${req.params.imageid}.pdf has already been saved`);
                }); 
            });    
        });

    })
    .catch(err => {
        return res.status(500).end("Oppps!Serer side error!");
    });
});

// unsave the pdf file
app.get('/api/report/unsave/:imageid/', isAuthenticated, function (req, res, next) {
    let local_path = `uploads/${req.params.imageid}.pdf`;
    // delete the file from the cloud bucket
    let bucket_path = `${req.username}/tempPdf/${req.params.imageid}.pdf`;
    storage.bucket(bucketName).file(bucket_path).delete()
    .then(() => {
        res.setHeader("Access-Control-Allow-Credentials","true");
        return res.status(200).end(`The file ${req.params.imageid}.pdf has already been removed`);
    })
    .catch(err => {
        console.error('ERROR:', err);
    });  
});

// get history page
// need to use session with get method
app.post('/api/report/history/', isAuthenticated, function (req, res, next) {
    let results = {'reportObjArr':[]};
    let username = req.body.username;
    mongoClient.connect(dbUrl, {useNewUrlParser: true}, function(err, db) {
        if (err) return res.status(500).end("Oppps!Serer side error!");
        let reports = db.db('cscc09').collection('reports');  
        reports.find({username: username}).project({imagePath: 1, imageid: 1}).toArray(function(err, report_lst) {
            report_lst.forEach(function(report) {
                let result = {};
                result['image'] = `${public_access_url}${report.imagePath}`;
                result['imageId'] = report.imageid;
                result['time'] = ObjectId(report._id).getTimestamp();
                results.reportObjArr.push(result);
            });
            res.setHeader("Access-Control-Allow-Credentials","true");
            res.json(results);
        });    
    });
});

app.get('/api/report/:imageid/', isAuthenticated, function (req, res, next) {
    mongoClient.connect(dbUrl, {useNewUrlParser: true}, function(err, db) {
        if (err) return res.status(500).end("Oppps!Serer side error!");
        let reports = db.db('cscc09').collection('reports');
        reports.findOne({imageid: req.params.imageid}, {projection: {_id: 0, path: 1, username: 1}}, function(err, report) {
            if (req.username != report.username) return res.status(401).end("access denied");
            let report_path = report.path;
            let result = {};
            result['url'] = `${public_access_url}${report_path}`;
            return res.json(result);
        });    
    });
});

app.delete('/api/report/:imageid/', isAuthenticated, function (req, res, next) {
    // delete image and report entry from mongodb
    mongoClient.connect(dbUrl, {useNewUrlParser: true}, function(err, db) {
        if (err) return res.status(500).end("Oppps!Serer side error!");
        let reports = db.db('cscc09').collection('reports');
        let images =  db.db('cscc09').collection('images');
        reports.findOne({imageid: req.params.imageid}, {projection: {username: 1}}, function(err, report) {
            if (err) return res.status(500).end("Oppps!Serer side error!");
            // check if the user is deleting others reports
            if (req.username != report.username) return res.status(401).end("access denied");
            images.findOneAndDelete({_id: ObjectId(req.params.imageid)}, {projection: {path: 1}}, function(err, image) {
                if (err) return res.status(500).end("Oppps!Serer side error!");
                reports.findOneAndDelete({imageid: req.params.imageid}, {projection: {_id: 1, path: 1, imagePath: 1}}, function(err, report) {
                    if (err) return res.status(500).end("Oppps!Serer side error!");
                    // delete image and report file from bucket
                    let image_path = report.value.imagePath;
                    let path = report.value.path;
                    // delete the image from the bucket
                    storage.bucket(bucketName).file(image_path).delete()
                    .then(() => {
                        // delete the report from the bucket
                        storage.bucket(bucketName).file(path).delete()
                        .then(() => {
                            res.setHeader("Access-Control-Allow-Credentials","true");
                            return res.status(200).end(`The image with id ${req.params.imageid}  and its corresponding pdf have already been removed`);
                        })
                        .catch(err => {
                            return res.status(500).end("Oppps!Serer side error!");
                        });
                    })
                    .catch(err => {
                        return res.status(500).end("Oppps!Serer side error!");
                    });
                });
            });
        });
    });
});


// sign up
app.post('/signup/', function (req, res, next) {
    let username = req.body.username;
    let password = req.body.password;
    mongoClient.connect(dbUrl, {useNewUrlParser: true}, function(err, db) {
        if (err) return res.status(500).end("Oppps!Serer side error!");
        let users = db.db('cscc09').collection('users');   
        // console.log(username);
        users.findOne({username: username}, {projection: {_id: 0, username: 1}}, function(err, user) {
            if (err) return res.status(500).end("Oppps!Serer side error!");
            if (user) return res.status(409).end("username " + username + " already exists");
            let salt = generateSalt();
            let hash = generateHash(password, salt);
            // update the db
            users.updateOne({username: username},{ $set: {username: username, hash: hash, salt: salt}}, {upsert: true}, function(err){
                if (err) return res.status(500).end("Oppps!Serer side error!");
                // initialize cookie
                res.setHeader('Set-Cookie', cookie.serialize('username', username, {
                      path : '/', 
                      maxAge: 60 * 60 * 24 * 7
                }));
                db.close();
                return res.json("user " + username + " signed up");
            });            
        });
    });
});

// signin
app.post('/signin/', function (req, res, next) {
    let username = req.body.username;
    let password = req.body.password;
    mongoClient.connect(dbUrl, {useNewUrlParser: true}, function(err, db) {
        if (err) return res.status(500).end("Oppps!Serer side error!");
        let users = db.db('cscc09').collection('users');   
        // console.log(username);
        users.findOne({username: username}, {projection: {_id: 0, username: 1, hash: 1, salt: 1}}, function(err, user) {
            if (err) return res.status(500).end("Oppps!Serer side error!");
            if (!user) return res.status(401).end("access denied");
            if (user.hash !== generateHash(password, user.salt)) return res.status(401).end("access denied"); 
            // initialize cookie
            res.setHeader('Set-Cookie', cookie.serialize('username', username, {
                path : '/', 
                maxAge: 60 * 60 * 24 * 7
            }));
            // start a session
            req.session.user = user;
            return res.json("user " + username + " signed in");
        });
    });
});

// signout
app.get('/signout/', function (req, res, next) {
    let username = req.username;
    res.setHeader('Set-Cookie', cookie.serialize('username', '', {
          path : '/', 
          maxAge: 60 * 60 * 24 * 7 // 1 week in number of seconds
    }));
    req.session.destroy();
    res.redirect('/');
});


// recover password
app.post('/reset/', function (req, res, next) {
    let username = req.body.username;
    // reset the password to the same as the username
    let password = req.body.username;
    mongoClient.connect(dbUrl, {useNewUrlParser: true}, function(err, db) {
        if (err) return res.status(500).end("Oppps!Serer side error!");
        let users = db.db('cscc09').collection('users');   
        users.findOne({username: username}, {projection: {_id: 0, username: 1, hash: 1, salt: 1}}, function(err, user) {
            if (err) return res.status(500).end("Oppps!Serer side error!");
            if (!user) return res.status(401).end("access denied");
            // generate the new password
            let salt = generateSalt();
            let hash = generateHash(password, salt);
            // update the db
            users.updateOne({username: username},{ $set: {username: username, hash: hash, salt: salt}}, {upsert: true}, function(err){
                if (err) return res.status(500).end("Oppps!Serer side error!");
                db.close();
                return res.json("user " + username + "'s password has been reset");
            });
        });
    });
});

// upload image and return text
app.post('/api/search/image/', upload.single('image'), function (req, res, next) {
    // save the file into uploads dir
    let file_extension = req.files.image.mimetype.split('/')[1];
    let path = `uploads/${req.files.image.md5}.${file_extension}`;
    fs.writeFile(path, (Buffer.from(req.files.image.data)).toString('binary'),  "binary",function(err) { });
    let nutrients = [];
    client.textDetection(path).then(results => {
        // find all the nutrients detected by Google Vision API
        let raw = results[0].textAnnotations[0].description.split("\n").filter(phrase => (!(/^\d+$/.test(phrase)) && !(/pour/.test(phrase)) && !(/Per/.test(phrase)) && !(/%/.test(phrase))) && ((/\d/.test(phrase)) || (/O/.test(phrase))));
        // handle the situation where the detected looks like this --- Iron/Fer, in long-text spliting
        let eng_fr = raw.filter(phrase => /\w\/\w/.test(phrase));
        raw.forEach(function(phrase) {
            let basic = phrase.split("/")[0];
            let remove_total_filtered = basic.replace("Total", "");
            // handle the situation when Google API detects '0' into 'O'
            let remove_uppero_filtered = remove_total_filtered.split('O')[0]
            let further_filtered = remove_uppero_filtered.split(/(\d+)/)[0].trim()
            if (further_filtered != "Calories" && further_filtered != "Includes") nutrients.push(further_filtered);
        });
        eng_fr.forEach(function(phrase) {
            if(phrase.split(" ")[0].includes("/")) nutrients.push(phrase.split(" ")[0]);
        });
        // for each nutrient, find their corresponding coordinates
        let json_result = {};
        let keywords = results[0].textAnnotations.slice(1);
        let width = results[0].fullTextAnnotation.pages[0].width;
        let height = results[0].fullTextAnnotation.pages[0].height;
        nutrients.forEach(function(nutrient) {
            // basic scenario
            let detail = keywords.filter(keyword => keyword.description == nutrient);
            // handle situation where the detected text contains '/' in the end
            if(detail.length == 0){
                detail = keywords.filter(keyword => keyword.description == nutrient+"\/");
            }
            let ymin = height, ymax = 0, xmin = width, xmax = 0;
            // pack the nutrient with the coordinates
            if (detail.length != 0){
                let vertices = detail[0].boundingPoly.vertices;
                vertices.forEach(function(vertice) {
                    if (vertice.x > xmax) xmax = vertice.x;
                    if (vertice.x < xmin) xmin = vertice.x;
                    if (vertice.y > ymax) ymax = vertice.y;
                    if (vertice.y < ymin) ymin = vertice.y;
                });
                let vertice = {};
                vertice["yMax"] = ymax;
                vertice["yMin"] = ymin;
                vertice["xMax"] = xmax;
                vertice["xMin"] = xmin;
                // get rid off the '/' in some phrases like 'Iron/Fer'
                json_result[nutrient.split("/")[0].toLowerCase()] = vertice;
            }
            // handle the situation where the nutrient contains at least two words
            if(detail.length == 0){
                let splited = nutrient.split(" ");
                for (let i = 0; i < keywords.length; i++){
                    if(splited[0] == keywords[i].description){
                        let j = 1, valid = true;
                        let vertices = keywords[i].boundingPoly.vertices;
                        vertices.forEach(function(vertice) {
                            if (vertice.x > xmax) xmax = vertice.x;
                            if (vertice.x < xmin) xmin = vertice.x;
                            if (vertice.y > ymax) ymax = vertice.y;
                            if (vertice.y < ymin) ymin = vertice.y;
                        });
    
                        while(j < splited.length && valid){
                            vertices = keywords[i+j].boundingPoly.vertices;
                            if(splited[j] == keywords[i+j].description){
                                vertices.forEach(function(vertice) {
                                    if (vertice.x > xmax) xmax = vertice.x;
                                    if (vertice.x < xmin) xmin = vertice.x;
                                    if (vertice.y > ymax) ymax = vertice.y;
                                    if (vertice.y < ymin) ymin = vertice.y;
                                });
                                j++;
                            } else if(splited[j] == keywords[i+j].description.split('/')[0]){
                                //handle the vitamin
                                vertices.forEach(function(vertice) {
                                    if (vertice.x > xmax) xmax = vertice.x;
                                    if (vertice.x < xmin) xmin = vertice.x;
                                    if (vertice.y > ymax) ymax = vertice.y;
                                    if (vertice.y < ymin) ymin = vertice.y;
                                });
                                j++;
                            } else{
                                valid = false; 
                            }
                        }
                        if(valid){
                            let coordinates = {};
                            coordinates["yMax"] = ymax;
                            coordinates["yMin"] = ymin;
                            coordinates["xMax"] = xmax;
                            coordinates["xMin"] = xmin;            
                            console.log(`Successfully match ${nutrient}`)
                            json_result[nutrient.split("/")[0].toLowerCase()] = coordinates;
                            break;
                        }
                    }
                }
                let index = keywords.indexOf(keywords.filter(keyword => keyword.description == splited[0]), 2);
            }
        });
        json_result['width'] = width;
        json_result['height'] = height;

        // upload the file to the cloud bucket
        let bucket_path;
        if (req.username){
            bucket_path = `${req.username}/${path}`;
        } else{
            bucket_path = `temp/${path}`;
        }
        storage.bucket(bucketName).upload(path, {
            destination: bucket_path,
            metadata: {
            // Enable long-lived HTTP caching headers
            // Use only if the contents of the file will never change
            // (If the contents will change, use cacheControl: 'no-cache')
            cacheControl: 'public, max-age=31536000',
            },
        })
        .then(() => {
            console.log(`${bucket_path} uploaded to ${bucketName}.`);
            // store the image info into db
            mongoClient.connect(dbUrl, {useNewUrlParser: true}, function(err, db) {
                if (err) return res.status(500).end("Oppps!Serer side error!");
                let images = db.db('cscc09').collection('images');
                // insert bucket path and the scanning result into the db
                images.updateOne({path: bucket_path}, {$set: {path: bucket_path, result: Object.keys(json_result).slice(0, -2)}},  {upsert: true}, function(err){
                    if (err) return res.status(500).end("Oppps!Serer side error!");
                    // get the imageID
                    images.findOne({path: bucket_path}, {projection: {_id: 1}}, function(err, image) {
                        db.close();
                        json_result['id'] = image._id;
                        return res.json(json_result);
                    });
                });            
            });
        })
        .catch(err => {
            console.error('ERROR:', err);
        });
    }).catch(err => {
        console.error('ERROR:', err);
    });
});

app.get('/api/nutrient/:name/', function (req, res, next) {
    mongoClient.connect(dbUrl, {useNewUrlParser: true}, function(err, db) {
        if (err) return res.status(500).end("Oppps!Serer side error!");
        let nutrients = db.db('cscc09').collection('nutrients');
        nutrients.findOne({name: req.params.name}, {projection: {_id: 0, name: 1, details: 1}}, function(err, nutrient) {
            db.close();
            return res.json(nutrient);
        });
    });
});

// fuzzy search
app.get('/api/fuzzy/nutrient/:keyword/', function (req, res, next) {
    if (!req.params.keyword) return res.json([]);
    mongoClient.connect(dbUrl, {useNewUrlParser: true}, function(err, db) {
        if (err) return res.status(500).end("Oppps!Serer side error!");
        let nutrients = db.db('cscc09').collection('nutrients');
        nutrients.find().project({_id: 0, name: 1, details: 1}).toArray(function(err, nutrients_lst) {
            db.close();
            // use fusejs API to generate the related keywords
            // referenced site: https://fusejs.io/
            let options = {
                shouldSort: true,
                threshold: 0.6,
                location: 0,
                distance: 100,
                maxPatternLength: 32,
                minMatchCharLength: 1,
                keys: [
                    "name"
                ]
            };
            var fuse = new Fuse(nutrients_lst, options);
            var result = fuse.search(req.params.keyword);
            if (result.length > 5) result = result.slice(0,5);
            return res.json(result);
        });
    });
});

const http = require('http');
const PORT = 8080;

http.createServer(app).listen(PORT, function (err) {
    if (err) console.log(err);
    else console.log("HTTP server on http://localhost:%s", PORT);
});
