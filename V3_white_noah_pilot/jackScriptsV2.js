let DiscoveriesFound = [""];
let DiscoveryIntents = ["QID1", "QID2", "QID3", "QID4", "QID5", "QID6", "QID7", "QID8", "QID9", "QID10", "QID11", "QID12"];
var sessionID = 0;
var sessionID_QID = "QID14";
var EO_QID = "QID15";
var EOResponse = "";
var EOR2Save = false;
var EOdisplayed = false;

var chatGPTPending = false; // Flag to check if GPT response is pending
var gptCalled = false; // Flag to check if GPT call has already been made
let gptProcessing = false;
let observer = null;
var AWS_videoURL_Base = "https://agsdialogflow.s3.amazonaws.com/V3_noah_jack_dialogflow_March7/Jack_Videos/";
var logData = [
    ["Time Stamp","Question", "Expected Answer", "Returned Answer", "Answer Type", "Filter Result"]
]

//find dfMessenger declared in html file
const dfMessenger = document.querySelector('df-messenger');
let questionList = document.getElementById("questionList");
/* 
    If listeners to find if a message is sent or a button is clicked are needed go here for documentation
    https://cloud.google.com/dialogflow/es/docs/integrations/dialogflow-messenger
*/

function onlyUnique(value, index, self) { return self.indexOf(value) === index; }
var potentialQuestions = [];

function GetCurrentTime(){
    // Get the current time in milliseconds
    const now = new Date();
    const milliseconds = now.getMilliseconds();
    const nanoseconds = (milliseconds * 1e6).toString().padStart(9, '0');

    // Format the current time in NYC timezone
    const options = { timeZone: 'America/New_York', hour12: false, fractionalSecondDigits: 3 };
    const formatter = new Intl.DateTimeFormat('en-US', {
        ...options,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    // Get the formatted date parts
    const parts = formatter.formatToParts(now);
    let datePart = '';
    let timePart = '';
    parts.forEach(part => {
        if (part.type === 'literal') {
            if (part.value === ', ') {
                return;
            }
            if (part.value === '/') {
                datePart += '-';
                return;
            }
        }
        if (part.type === 'day' || part.type === 'month' || part.type === 'year') {
            datePart += part.value;
        }
        if (part.type === 'hour' || part.type === 'minute' || part.type === 'second') {
            timePart += part.value;
        }
        if (part.type === 'literal' && part.value === ':') {
            timePart += ':';
        }
    });

    // Combine date and time parts with nanoseconds
    const formattedDate = `${datePart.slice(4, 8)}-${datePart.slice(0, 2)}-${datePart.slice(2, 4)}`;
    const isoStringWithNanoseconds = `${formattedDate}T${timePart}.${nanoseconds}Z`;

    return isoStringWithNanoseconds;
}

var audioPlayer = document.getElementById('myAudio');
async function AttachTTS(gptAudioData){
    // Remove data string prefix 
    if (gptAudioData.startsWith("data:audio/mp3;base64,")) {
        gptAudioData = gptAudioData.replace("data:audio/mp3;base64,", "");
    }

    // Convert the base64 string to a Uint8Array
    let binaryString = atob(gptAudioData);
    let len = binaryString.length;
    let bytes = new Uint8Array(len);
    for(let i = 0; i < len; i++){
        bytes[i] = binaryString.charCodeAt(i);
    }

    // Create a Blob from the Uint8Array
    let blob = new Blob([bytes], { type: 'audio/mpeg' });

    // Create a URL for the Blob
    let audioURL = URL.createObjectURL(blob);

    // Set the audio element's source to the Blob URL
    audioPlayer.src = audioURL;

    //audioPlayer.play();

}  

var ENDPOINT_URL = 'https://noah-api-proxy.onrender.com/api/'
                    //'http://3.219.130.25/api/';
                  //'https://verg-api-zone.cise.ufl.edu/api/'; 
                  //'https://98.84.121.124/api/';  
                   //'http://98.84.121.124/api/';

async function newGPT(userQuestion){
    console.log("Contacting updated GPT Endpoint...");

    var gptInput = "" + userQuestion;
    console.log("GPT INPUT IS:", gptInput);
    try{
        let response = await fetch(ENDPOINT_URL + 'noahgpttext', {
            method: 'POST', headers: {"Content-Type": "application/json",},
            //body: JSON.stringify({message : gptInput}),
            body: JSON.stringify({message : gptInput}),
        }); 

        const res = await response.json();
        //console.log("NEW GPT:",res);
        return res.message_response;
    }
    catch (error){
        console.error("Error:", error);
        return "Sorry, I can't understand your question. Could you please ask it in another way?";
    }

}
async function GenerateTTS(gptResponse){
    var voiceID = "T78XcsKYYnR6LBzKRqVC";
    var modelID = "eleven_multilingual_v2";
    try{

        var bodyData = { 
                "message": gptResponse, // String
                "voice_id": "T78XcsKYYnR6LBzKRqVC", // String
                "model_id": "eleven_multilingual_v2", // String
                "stability": 0.5, // Float/Double
                "similarity_boost": 0.75, // Float/Double
                "style": 0.0, // Float/Double
                "use_speaker_boost": true // Boolean
        }

        //console.log(bodyData);
        

        let response = await fetch(ENDPOINT_URL + 'noahgptaudio', {
            method: 'POST', headers: {"Content-Type": "application/json",},
            body: JSON.stringify(bodyData),
        }); 

        const res = await response.json();
        return res.audioData;
    }
    catch (error){
        console.error("Error for AUDIO:", error);
        return "";
    }
}
async function SensicalFilter(statement, noahResponse){
    try{
        var bodyData = { 
            "statement": statement, 
            "response": noahResponse
        }
        let response = await fetch(ENDPOINT_URL + 'noahgptfilter', {
            method: 'POST', headers: {"Content-Type": "application/json",},
            body: JSON.stringify(bodyData),
        }); 

        const res = await response.json();
        return res.output;
    }
    catch (error){
        console.error("Error for FILTER:", error);
        return "";
    }
}

var numOfTimesGPTUsed = 0;
var wasGPTAccessedPrev = false;
var res = "";
var gptWaitingMessage = "\t...\t";
async function updateLatestMessage(messageNode, queryText){

    // Make it "           " until GPT responds
    messageNode.innerText = gptWaitingMessage;

    //const gptResponse = await GPT(queryText);
    // GET GPT TEXT
    var gptResponse = "I dont know but i wanted to talk about feeling down";
    if(numOfTimesGPTUsed <= 3){
        gptResponse = await newGPT(queryText);
    }
    else{
        numOfTimesGPTUsed = 0;
    }
    //const gptResponse = await newGPT(queryText);
    // GET GPT AUDIO
    const audioDataURL = await GenerateTTS(gptResponse);
    
    // ATTACH GPT AUDIO TO VIDEO PLAYER
    AttachTTS(audioDataURL);
    
    console.log("Attempting to change latest message...");

    messageNode.innerText = gptResponse;
    messageNode.style.visibility = 'visible';
    chatGPTPending = false; // Reset the flag once GPT response is received
    gptProcessing = false;

    var videoPlayer = document.getElementById("myVideo");

    audioPlayer.onloadedmetadata = function (){
        // change the video and play it 
        changeVid("mumble_gpt");

        audioPlayer.play();
        
        
        // Adjust video playback time based on audio duration
        let audioDuration = audioPlayer.duration;
        videoPlayer.currentTime = 0;
        videoPlayer.play();

        audioPlayer.onended = function (){
            videoPlayer.pause();
            switchIdle();
        }

    }
}

let processingMessage = null;
let processedMessages = new Set();
async function UpdateNew(messageNode, queryText, gptState){
    // if(processingMessage == messageNode){
    //     console.log("Duplicate found");
    //     return;
    // }
    // else{
    //     processingMessage = messageNode;
    //     console.log("New message so we can proceed");
    // }

    if(processedMessages.has(messageNode)){
        console.log("Duplicate in processing msgs list found");
        return;
    }
    processedMessages.add(messageNode);
    
    console.log("MESSAGE NODE=", messageNode);
    console.log("Is gpt processing?:", gptState);

    if(gptState){ // FOR GPT Responses
        // Make it "           " until GPT responds
        messageNode.innerText = gptWaitingMessage;

        if(queryText == "what is blue"){ // JUST TO TEST FILTER, REMOVE BEFORE UPLOADING TO AWS =======================
            initialDfMessage = "effiel tower is awesome!";
        }
        if(queryText == "sup"){ // JUST TO TEST FILTER, REMOVE BEFORE UPLOADING TO AWS =======================
            initialDfMessage = "asfdasdfasdf";
        }

        //const gptResponse = await GPT(queryText);
        // GET GPT TEXT
        var gptResponse = "I dont know but i wanted to talk about feeling down";
        var expectedResponse = gptResponse;
        if(numOfTimesGPTUsed <= 3){

            if(queryText != "what is blue" && queryText != "sup"){
                gptResponse = await newGPT(queryText);
                expectedResponse = gptResponse;
            }
            else{
                if(queryText == "what is blue"){ // JUST TO TEST FILTER, REMOVE BEFORE UPLOADING TO AWS =======================
                    gptResponse = "effiel tower is awesome!";
                    expectedResponse = gptResponse;
                }
                if(queryText == "sup"){ // JUST TO TEST FILTER, REMOVE BEFORE UPLOADING TO AWS =======================
                    gptResponse = "asfdasdfasdf";
                    expectedResponse = gptResponse;
                }
            }

            
        } 
        else numOfTimesGPTUsed = 0;

        var filterRes = await SensicalFilter(queryText, gptResponse);
        if(gptResponse == "I don't know but i wanted to talk about feeling down") filterRes = "sensical"; 
        console.log("FILTER SAYS:", filterRes);
        var isNonsensical = filterRes == "nonsensical";
        if(isNonsensical){
            console.log(`The filter found the clinicial response [${queryText}] and Noah response [${gptResponse}] as nonsensical`);
            gptResponse = "Sorry, I can't understand your question. Could you please ask it in another way?"
        }
        
        // GET GPT AUDIO
        const audioDataURL = await GenerateTTS(gptResponse);
        // ATTACH GPT AUDIO TO VIDEO PLAYER
        AttachTTS(audioDataURL);
        
        console.log("Attempting to change latest message with GPT...");
        console.log("FILTER Shows " + (isNonsensical ? "Nonsensical" : "Sensical"));

        messageNode.innerText = gptResponse;
        messageNode.style.visibility = 'visible';
        chatGPTPending = false; // Reset the flag once GPT response is received
        gptProcessing = false;

        // LOG INFO
        // ["Time Stamp","Question", "Expected Answer", "Returned Answer", "Answer Type", "Filter Result"]
        logData.push(
            [getFormattedDateTime(), queryText, expectedResponse, gptResponse, "GPT", filterRes]
        );


        var videoPlayer = document.getElementById("myVideo");

        if(isNonsensical){
            var videoStr = AWS_videoURL_Base + FilterQueryFufillmentText(gptResponse) + ".mp4";
            changeVid(videoStr);
        }
        else{
            audioPlayer.onloadedmetadata = function (){
                // change the video and play it 
                var videoStr = "mumble_gpt";
                if(isNonsensical) videoStr = AWS_videoURL_Base + FilterQueryFufillmentText(gptResponse) + ".mp4";
                
                changeVid(videoStr);
    
                audioPlayer.play();
                
                
                // Adjust video playback time based on audio duration
                let audioDuration = audioPlayer.duration;
                videoPlayer.currentTime = 0;
                videoPlayer.play();
    
                audioPlayer.onended = function (){
                    videoPlayer.pause();
                    switchIdle();
                }
    
            }
        }


    }
    else{ // FOR DF RESPONSES
        var initialDfMessage = messageNode.innerText; // Store the initial DF message
        console.log("initialDfMessage", messageNode.innerText);
        var expectedResponse = initialDfMessage;
        if(queryText == "what is blue"){ // JUST TO TEST FILTER, REMOVE BEFORE UPLOADING TO AWS =======================
            initialDfMessage = "effiel tower is awesome!";
        }
        if(queryText == "sup"){ // JUST TO TEST FILTER, REMOVE BEFORE UPLOADING TO AWS =======================
            initialDfMessage = "shut up! leave me alone";
        }
        console.log("DF MESSAGE=", initialDfMessage);
        // Make it "           " until filter goes through
        messageNode.innerText = gptWaitingMessage;

        var filterRes = await SensicalFilter(queryText, initialDfMessage);
        console.log("FILTER SAYS:", filterRes);
        var isNonsensical = filterRes == "nonsensical";
        if(isNonsensical){
            console.log(`The filter found the clinicial response ${queryText} and Noah response ${initialDfMessage} as nonsensical`);
            initialDfMessage = "Sorry, I can't understand your question. Could you please ask it in another way?"
        }
        
        console.log("Attempting to change latest message...");
        console.log("FILTER Shows " + (isNonsensical ? "Nonsensical" : "Sensical"));
        
    
        messageNode.innerText = initialDfMessage;
        messageNode.style.visibility = 'visible';
        chatGPTPending = false; // Reset the flag once GPT response is received
        gptProcessing = false;

        // LOG INFO
        // ["Time Stamp","Question", "Expected Answer", "Returned Answer", "Answer Type", "Filter Result"]
        logData.push(
            [getFormattedDateTime(), queryText, expectedResponse, initialDfMessage, "DF", filterRes]
        );

    
        // play video
        var videoURL = AWS_videoURL_Base + FilterQueryFufillmentText(initialDfMessage) + ".mp4";
        console.log("Change to this: " + videoURL);
        changeVid(videoURL);
        var vid = document.getElementById("myVideo");

        //videoPlayer.currentTime = 0;
        vid.play();

        vid.onended = function (){
            //videoPlayer.pause();
            switchIdle();
        }

    }

    processedMessages.add(messageNode); // Mark the message as processed
}


var userIP = '';

let queryText = "";
dfMessenger.addEventListener('df-response-received', async function (event) {
    if(gptProcessing) return;

    audioPlayer.pause();
    audioPlayer.currentTime = 0;

    // set session id to send to qualtrics later
    //sessionID = dfMessenger.getAttribute("session-id");

    //displayName is the name you give in Dialog flow to the intent, name is the intent id dialogflow assigns
    var potentialNonresAns;
    var displayName = event.detail.response.queryResult.intent.displayName;
    var potentialAnswers = event.detail.response.queryResult.knowledgeAnswers;
    var detectConfidence = event.detail.response.queryResult.intentDetectionConfidence;

    //fulfillmentText is Dialogflow's response
    var queryFufillmentText = event.detail.response.queryResult.fulfillmentText;

    //queryText is what the user sent
    queryText = event.detail.response.queryResult.queryText;

    var tempGPTCheck = false;

    if (event.detail.response.alternativeQueryResults != null) potentialNonresAns = event.detail.response.alternativeQueryResults[0].knowledgeAnswers;


    if(displayName == "Default_Fallback"){ //  USE GPT
        numOfTimesGPTUsed += 1;
        queryFufillmentText = "mumble_gpt";
        wasGPTAccessedPrev = true;
        chatGPTPending = true; // Set the flag when GPT response is needed
        gptProcessing = true;
        tempGPTCheck = true;
        console.log('ChatGPT should be used now');


    }
    else{ // PROCEED WITH DF
        chatGPTPending = false; // Set the flag when GPT response is needed
        gptProcessing = false;
        tempGPTCheck = false;
        console.log('DF should be used now');
    }

    let dfMessenger = document.querySelector("body > df-messenger").shadowRoot;
    //console.log("dfMessenger:", dfMessenger);
    let dfMessengerChat = dfMessenger.querySelector("div > df-messenger-chat").shadowRoot;
    //console.log("dfMessengerChat:", dfMessengerChat);
    let dfMessageList = dfMessengerChat.querySelector("div > df-message-list").shadowRoot;
    //console.log("dfMessageList:", dfMessageList);
    let messageListNode = dfMessageList.querySelector("#messageList");
    console.log("messageListNode:", messageListNode);
    let lastMessageNode = messageListNode.querySelector('df-message[isbot]');
    //console.log("lastMessageNode", lastMessageNode);

    // Observer to watch for changes in the message list [NEW]
    let observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(newMessageNode => {
                //console.log("NEW MESSAGE NODE=", newMessageNode);
                //console.log("\tNEW MESSAGE NODE NAME=", newMessageNode.nodeName);
                //console.log("\tNEW MESSAGE NODE type=", newMessageNode.nodeType);
                if (newMessageNode.nodeType === 1 && newMessageNode.nodeName === "DIV" && newMessageNode.classList.contains("bot-message")) {
                    
                    // Remove the visually hidden "Agent Says:" part
                    let hiddenSpan = newMessageNode.querySelector(".visually-hidden");
                    if (hiddenSpan) hiddenSpan.remove(); // Remove the span from DOM

                    console.log("New bot message detected:", newMessageNode);

                    if (processedMessages.has(newMessageNode)) return; // Skip if already processed
                    if(newMessageNode.innerText != '..'){
                        UpdateNew(newMessageNode, queryText, chatGPTPending);
                    }
                    else{
                        console.log('Found .. bug, so skip it');
                    }
                    

                    // Mutation is also recording when the initial df message is "..", which is why it's =========================================================
                    // running into current error. make it so that if the initial df message is "..", 
                    // we dont change anything ===================================================================================================================
                }
            });
        });
    });

    observer.observe(messageListNode, { childList: true, subtree: true });

      /*// Observer to watch for changes in the message list [OLD]
    let observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            console.log("\tMutation:", mutation);
            if (mutation.addedNodes.length > 0) {
                const newMessageNode = mutation.addedNodes[0];
                console.log('New message NOde: ', newMessageNode);
                if(newMessageNode.classList.contains(('bot-message')) && newMessageNode.id != "typing"){
                    if (processedMessages.has(newMessageNode)) return; // Skip if already processed
                    console.log("\tMutation:", mutation);
                    //newMessageNode.innerHTML = gptWaitingMessage;
                    //console.log("Query text inside mutation=", queryText);
                    //updateLatestMessage(newMessageNode, queryText);
                    UpdateNew(newMessageNode, queryText, chatGPTPending);
                    queryFufillmentText = newMessageNode.innerHTML;
                }
 
            }
        });

        //console.log("MUTATIONS=", mutations);
    });

    // Start observing the message list for changes
    observer.observe(messageListNode, { childList: true });*/

    // Clear the processed messages set after processing is done
    processedMessages.clear();

    if(!chatGPTPending) wasGPTAccessedPrev = false;

    if(!tempGPTCheck) numOfTimesGPTUsed = 0; //  REMOVE IF NOT WORKING WELL

    eventDataStr = `(NEW)
    Display Name: ${displayName}
    Query Text: ${queryText}
    # of Times GPT was Accessed Consecutively: ${numOfTimesGPTUsed}
    Was GPT Accessed Previously?: ${wasGPTAccessedPrev}`
    console.log(eventDataStr);

    //make AWS video link
    //change this to link to AWS Repo for scenario videos
    

    // queryFufillmentText = FilterQueryFufillmentText(queryFufillmentText);
    // var videoURL = AWS_videoURL_Base + queryFufillmentText + ".mp4";
    // if(!wasGPTAccessedPrev){
    //     console.log("Since gpt ain't running, change it rn");
    //     console.log(videoURL); // ----------------------------------
    // } 
    
    // if(queryFufillmentText !=  "" && !wasGPTAccessedPrev) {
    //     console.log("Change video now to say:", queryFufillmentText);
    //     changeVid(videoURL)
    // }

    // console.log("----------------------------------");
});

function ConvertToCSV(data) {
    const array = [Object.keys(data[0])].concat(data);
  
    return array.map(row => {
        return Object.values(row).map(value => {
            // Enclose the value in double quotes if it contains a comma or a double quote
            const stringValue = String(value);
            if (stringValue.includes(',') || stringValue.includes('"')) {
                // Escape double quotes by doubling them
                return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
        }).join(',');
    }).join('\n');
}

// GOOGLE API STUFF ===========================================================================================

/* exported gapiLoaded */
/* exported gisLoaded */
/* exported handleAuthClick */
/* exported handleSignoutClick */

// // TODO(developer): Set to client ID and API key from the Developer Console
// const CLIENT_ID = '682400419090-hu8bnl169g7hnb48a7291f4c89cp0fhd.apps.googleusercontent.com';
// const API_KEY = 'AIzaSyCvpryvFdhUe_5nP0jpmD6vytahvTUENLE';

// // Discovery doc URL for APIs used by the quickstart
// const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

// // Authorization scopes required by the API; multiple scopes can be
// // included, separated by spaces.
// const SCOPES = 'https://www.googleapis.com/auth/drive.metadata.readonly';

// let tokenClient;
// let gapiInited = false;
// let gisInited = false;

// // document.getElementById('authorize_button').style.visibility = 'hidden';
// // document.getElementById('signout_button').style.visibility = 'hidden';

// /**
// * Callback after api.js is loaded.
//  */
// function gapiLoaded() {
//     gapi.load('client', initializeGapiClient);
// }

// /**
// * Callback after the API client is loaded. Loads the
// * discovery doc to initialize the API.
// */
// async function initializeGapiClient() {
//     await gapi.client.init({
//         apiKey: API_KEY,
//         discoveryDocs: [DISCOVERY_DOC],
//     });
//     gapiInited = true;
//     //maybeEnableButtons();
// }

// /**
// * Callback after Google Identity Services are loaded.
// */
// function gisLoaded() {
//     tokenClient = google.accounts.oauth2.initTokenClient({
//         client_id: CLIENT_ID,
//         scope: SCOPES,
//         callback: '', // defined later
//     });
//     gisInited = true;
//     //maybeEnableButtons();
// }

// /**
// * Enables user interaction after all libraries are loaded.
// */
// function maybeEnableButtons() {
//     if (gapiInited && gisInited) {
//         //document.getElementById('authorize_button').style.visibility = 'visible';
//     }
// }

// /**
// *  Sign in the user upon button click.
// */
// function handleAuthClick() {
//     tokenClient.callback = async (resp) => {
//     if (resp.error !== undefined) {
//         throw (resp);
//     }
//     //document.getElementById('signout_button').style.visibility = 'visible';
//     //document.getElementById('authorize_button').innerText = 'Refresh';
//     await listFiles();
//     };

//     if (gapi.client.getToken() === null) {
//         // Prompt the user to select a Google Account and ask for consent to share their data
//         // when establishing a new session.
//         tokenClient.requestAccessToken({prompt: 'consent'});
//     } 
//     else {
//         // Skip display of account chooser and consent dialog for an existing session.
//         tokenClient.requestAccessToken({prompt: ''});
//     }
// }

// /**
// *  Sign out the user upon button click.
// */
// function handleSignoutClick() {
//     const token = gapi.client.getToken();
//     if (token !== null) {
//         google.accounts.oauth2.revoke(token.access_token);
//         gapi.client.setToken('');
//         document.getElementById('content').innerText = '';
//         document.getElementById('authorize_button').innerText = 'Authorize';
//         document.getElementById('signout_button').style.visibility = 'hidden';
//     }
// }

// /**
// * Print metadata for first 10 files.
// */
// async function listFiles() {
//     let response;
//     try {
//         response = await gapi.client.drive.files.list({
//             'pageSize': 10,
//             'fields': 'files(id, name)',
//         });
//     } catch (err) {
//         document.getElementById('content').innerText = err.message;
//         return;
//     }
//     const files = response.result.files;
//     if (!files || files.length == 0) {
//         document.getElementById('content').innerText = 'No files found.';
//         return;
//     }
//     // Flatten to string to display
//     const output = files.reduce(
//         (str, file) => `${str}${file.name} (${file.id})\n`,
//         'Files:\n');
//     document.getElementById('content').innerText = output;
// }

// function generateAndUploadFile() {
//     const csvContent = generateCSV();
//     const blob = new Blob([csvContent], { type: 'text/csv' });
//     const reader = new FileReader();

//     reader.onload = function(e) {
//       const base64File = btoa(e.target.result);
//       const fileName = 'generated_file.csv';
//       const contentType = 'text/csv';

//       const url = 'YOUR_WEB_APP_URL'; // Replace with your Google Apps Script web app URL
//       const data = {
//         file: base64File,
//         filename: fileName,
//         contentType: contentType
//       };

//       fetch(url, {
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/json'
//         },
//         body: JSON.stringify(data)
//       })
//       .then(response => response.json())
//       .then(result => {
//         if (result.status === 'success') {
//           alert('File uploaded successfully: ' + result.fileId);
//         } else {
//           alert('File upload failed: ' + result.message);
//         }
//       })
//       .catch(error => {
//         console.error('Error:', error);
//       });
//     };

//     reader.readAsBinaryString(blob);
//   }

//   // FOLDER ID: 1jmaWayEArIddddPXWfk70r9Xfz4hrTGz
//   function sendFileToGoogleDrive(filename, content) {
//     const url = 'http://script.google.com/macros/s/AKfycbzM2pUOGddl4EIglho7n087IEIqkIcUeEjUmOcGpTHgVGu8AqwZzjne9GmiJYSxDh5S/exec'; // Replace with your Google Apps Script web app URL

//     const data = {
//         filename: filename,
//         content: content
//     };

//     fetch(url, {
//         method: 'POST',
//         body: JSON.stringify(data),
//         headers: {
//             'Content-Type': 'application/json'
//         }
//     })
//     .then(response => response.text())
//     .then(result => {
//         console.log(result);
//     })
//     .catch(error => {
//         console.error('Error:', error);
//     });
// }

// ============================================================================================================


function getFormattedDateTime() {
    const now = new Date();

    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const year = now.getFullYear();
    
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return `${month}/${day}/${year} T${hours}:${minutes}:${seconds}`;
}

//console.log(getFormattedDateTime());


function CreateLogFile() {
    let csvContent = ConvertToCSV(logData);

    // Create a Blob from the CSV content
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

    // Create a downloadable link
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    let currTime = getFormattedDateTime();

    console.log(currTime);

    const fileName = "Noah_DF_GPT_log_" + currTime + ".csv";
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    document.body.appendChild(link); // Required for FF

    // Trigger the download
    link.click();

    // Cleanup
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return [csvContent, fileName];
}

//listen for response
// dfMessenger.addEventListener('df-response-received', async function (event) {

//     if(gptProcessing) {
//         return;
//     }

//     audioPlayer.pause();
//     audioPlayer.currentTime = 0;

//     // set session id to send to qualtrics later
//     sessionID = dfMessenger.getAttribute("session-id");

//     //displayName is the name you give in Dialog flow to the intent, name is the intent id dialogflow assigns
//     var potentialNonresAns;
//     var displayName = event.detail.response.queryResult.intent.displayName;
//     var potentialAnswers = event.detail.response.queryResult.knowledgeAnswers;
//     var detectConfidence = event.detail.response.queryResult.intentDetectionConfidence;

//     //fulfillmentText is Dialogflow's response
//     var queryFufillmentText = event.detail.response.queryResult.fulfillmentText;

//     //queryText is what the user sent
//     queryText = event.detail.response.queryResult.queryText;

//     var tempGPTCheck = false;

//     if (event.detail.response.alternativeQueryResults != null) potentialNonresAns = event.detail.response.alternativeQueryResults[0].knowledgeAnswers;

//     if (displayName == "Knowledge.KnowledgeBase.NjMwMzA0OTkxMjAyODIzMzcyOA" || displayName == "Default_Fallback" || (displayName != "Default_Fallback" && detectConfidence < 0.95)) {
//         if (potentialAnswers != null || potentialNonresAns != null) {
//             document.getElementById('potentialquestions').style.display = 'block';
//             var ans;
//             if (potentialAnswers != null) ans = potentialAnswers.answers;
//             else if (potentialNonresAns != null) ans = potentialNonresAns.answers;
//             console.log('Ans:', ans);

//             for (const an of ans) {
//                 if (an.matchConfidence > 0.65) potentialQuestions.push(an.faqQuestion);
//             }

//             // This is to highlight questions being hovered over or clicked on in the clarification window
//             potentialQuestions.forEach((item) => {
//                 let li = document.createElement("li");
//                 li.innerText = item;
//                 li.onclick = function (event) {
//                     document.querySelector("df-messenger").shadowRoot.querySelector("df-messenger-chat").shadowRoot.querySelector("df-messenger-user-input").shadowRoot.querySelector(".input-box-wrapper > input").value = item;
//                 };
//                 li.onmouseenter = function (event) {
//                     console.log("enter");
//                     li.style.color = "#FF0000";
//                 };
//                 li.onmouseleave = function (event) {
//                     console.log("out");
//                     li.style.color = "#000000";

//                 };
//                 questionList.appendChild(li);
//             })

//             wasGPTAccessedPrev = false;
//             numOfTimesGPTUsed = 0;
//         }
//         else if(displayName == "Default_Fallback"){ // Use CHATGPT if unable to find responses from intent and knowledge bases
            
//             numOfTimesGPTUsed += 1;
//             queryFufillmentText = "mumble_gpt";
//             // if(numOfTimesGPTUsed < -10) { 
//             //     // this would be changed to "I dont know but i wanted to talk about feeling down"
//             //     // once that video is made
//             //     queryFufillmentText = "Sorry, I can't understand your question. Could you please ask it in another way?";
//             //     //queryFufillmentText = "I don't know. That's not really on my mind at the moment.";
//             //     wasGPTAccessedPrev = false;
//             //     chatGPTPending = false; // Set the flag when GPT response is needed
//             //     tempGPTCheck = false;
//             //     //queryFufillmentText = "I dont know but i wanted to talk about feeling down";
//             //     //queryFufillmentText = "mumble_gpt";
//             // }
//             //else{                
//             wasGPTAccessedPrev = true;
//             chatGPTPending = true; // Set the flag when GPT response is needed
//             tempGPTCheck = true;
//             console.log('ChatGPT should be used now');

//             res = "This is a test to see if the text goes in";

//             let dfMessenger = document.querySelector("body > df-messenger").shadowRoot;
//             let dfMessengerChat = dfMessenger.querySelector("div > df-messenger-chat").shadowRoot;
//             let dfMessageList = dfMessengerChat.querySelector("div > df-message-list").shadowRoot;
//             let messageListNode = dfMessageList.querySelector("#messageList");

//             // Observer to watch for changes in the message list
//             let observer = new MutationObserver(mutations => {
//                 //console.log(mutations);
//                 mutations.forEach(mutation => {
//                     //if (mutation.addedNodes.length > 0 && displayName == "Default_Fallback" && numOfTimesGPTUsed <= 3 && tempGPTCheck) {
//                     if (mutation.addedNodes.length > 0 && chatGPTPending && !gptProcessing) {
//                         gptProcessing = true;
//                         const newMessageNode = mutation.addedNodes[0];
//                         //newMessageNode.style.visibility = 'hidden'; // Hide the new message node initially
//                         //newMessageNode.style.visibility = 'hidden'; // Hide the new message node initially with "..." to show gpt processing
//                         newMessageNode.innerHTML = gptWaitingMessage;
//                         //queryFufillmentText = "";
//                         console.log("Query text inside mutation=", queryText);
//                         updateLatestMessage(newMessageNode, queryText);
//                         queryFufillmentText = newMessageNode.innerHTML;
//                     }
//                 });
//             });

//             // Start observing the message list for changes
//             observer.observe(messageListNode, { childList: true });

//             //}
//         }
//     }

//     if(!chatGPTPending){
//         //numOfTimesGPTUsed = 0;
//         wasGPTAccessedPrev = false;
//     }

//     if(!tempGPTCheck) numOfTimesGPTUsed = 0; //  REMOVE IF NOT WORKING WELL

//     console.log('Display Name:', displayName);
//     console.log('Query  Text:', queryText);
//     console.log('# of Times GPT was Accessed Consecutively:', numOfTimesGPTUsed);
//     console.log('Was GPT Accessed Previously?:', wasGPTAccessedPrev);

//     //make AWS video link
//     //change this to link to AWS Repo for scenario videos
//     var AWS_videoURL_Base = "https://agsdialogflow.s3.amazonaws.com/noah_dialogflow/Jack_Videos/";

//     queryFufillmentText = FilterQueryFufillmentText(queryFufillmentText);
//     var videoURL = AWS_videoURL_Base + queryFufillmentText + ".mp4";
//     if(!wasGPTAccessedPrev){
//         console.log("Since gpt ain't running, change it rn");
//         console.log(videoURL); // ----------------------------------
//     } 
    
//     if(queryFufillmentText !=  "" && !wasGPTAccessedPrev) {
//         console.log("Change video now to say:", queryFufillmentText);
//         changeVid(videoURL)
//     }

//     console.log("----------------------------------");
// });

function FilterQueryFufillmentText(queryFufillmentText) {
    //console.log("BEFORE:", queryFufillmentText);
    console.log("Filtering query fulfillment...");

    // Replace multiple spaces with a single underscore
    queryFufillmentText = queryFufillmentText.replace(/\s+/g, '_');

    queryFufillmentText = queryFufillmentText.replaceAll("'", "")
                                             .replaceAll(",", "")
                                             .replaceAll(";", "")
                                             .replaceAll("-", "")
                                             .replaceAll(".mp4", "")
                                             .replaceAll(".", "")
                                             .replaceAll("?", "")
                                             .replaceAll(String.fromCharCode(8217), "") // apostrophe
                                             .replaceAll("!", "")
                                             .replaceAll("...", "");

    console.log("AFTER:", queryFufillmentText);

    // Handle specific cases where exact matches are needed
    switch (queryFufillmentText) {
        case "I_loved_running_around_and_being_active_and_competing_against_other_people_I_enjoy_the_rush_it_makes_me_feel_But_I_guess_Im_not_as_good_as_I_thought_since_I_couldnt_make_the_team_Ive_always_wanted_to_be_successful_like_my_favorite_players_dunk_like_Jordan_hit_homers_like_ARod_Seems_like_I_need_to_find_a_new_dream_now":
            queryFufillmentText = "I_loved_running_around_and_being_active_and_competing_against_other_people_I_enjoy_the_rush_it_makes_me_feel_But_I_guess_Im_not_as_good_as_I_thought_since_I_couldnt_make_the_team_Ive_always_wanted_";
            break;
        case "I_dont_have_friends_and_the_teachers_pick_on_me_And_also_I_am_not_on_the_soccer_team":
            queryFufillmentText = "I_dont_have_friends_and_the_teachers_pick_on_me__And_also_I_am_not_on_the_soccer_team";
            break;
        case "I_really_dont_want_to_talk_about_that":
            queryFufillmentText = "I_really_dont_want_to_talk_about_it";
            break;
        case "I_wish_they_would_just_ignore_me_Ive_never_been_a_bad_student_but_they_keep_picking_on_me_Its_like_they_hate_me_They_keep_asking_me_the_hardest_questions_in_the_class_and_sometimes_I_just_dont_know_the_answer_so_I_sit_there_mumbling_something_Its_humiliating_And_then_everybody_laughs_at_me":
            queryFufillmentText = "I_wish_they_would_just_ignore_me_Ive_never_been_a_bad_student_but_they_keep_picking_on_me_Its_like_they_hate_me_They_keep_asking_me_the_hardest_questions_in_the_class_and_sometimes_I_just_dont_know";
            break;
        case "In_video_games_I_can_escape_from_whats_going_on_around_me_be_who_I_want_to_be_and_choose_where_I_want_to_be_I_also_like_the_competition_Theres_so_many_different_types_of_games_I_can_choose_from_and_I_have_all_the_activities_I_need_in_one_place_I_dont_even_have_to_leave_my_room":
            queryFufillmentText = "In_video_games_I_can_escape_from_whats_going_on_around_me_be_who_I_want_to_be_and_choose_where_I_want_to_be_I_also_like_the_competition_Theres_so_many_different_types_of_games_I_can_choose_from_and";
            break;
        case "My_mom_works_in_a_bank_and_my_father_is_a_store_manager_at_AT&T":
            queryFufillmentText = "My_mom_works_in_a_bank_and_my_father_is_a_store_manager_at_ATandT";
            break;
        case "My_mom_works_in_a_bank_and_my_father_is_a_store_manager_at_AT&ampT":
            queryFufillmentText = "My_mom_works_in_a_bank_and_my_father_is_a_store_manager_at_ATandT";
            break;
        case "Yeah_He_is_a_store_manager_at_AT&T":
            queryFufillmentText = "Yeah_He_is_a_store_manager_at_ATandT";
            break;
        case "He_is_a_store_manager_at_AT&T":
            queryFufillmentText = "He_is_a_store_manager_at_ATandT";
            break;
    }



    return queryFufillmentText;
}

// function FilterQueryFufillmentText(queryFufillmentText) {
//     // Replace punctuation, spaces, and apostrophes with underscores
//     queryFufillmentText = queryFufillmentText.replace(/[,\-;.\s'!?…]+/g, '_');

//     // Handle specific cases where exact matches are needed
//     switch (queryFufillmentText) {
//         case "I_loved_running_around_and_being_active_and_competing_against_other_people_I_enjoy_the_rush_it_makes_me_feel_But_I_guess_Im_not_as_good_as_I_thought_since_I_couldnt_make_the_team_Ive_always_wanted_to_be_successful_like_my_favorite_players_dunk_like_Jordan_hit_homers_like_ARod_Seems_like_I_need_to_find_a_new_dream_now":
//             queryFufillmentText = "I_loved_running_around_and_being_active_and_competing_against_other_people_I_enjoy_the_rush_it_makes_me_feel_But_I_guess_Im_not_as_good_as_I_thought_since_I_couldnt_make_the_team_Ive_always_wanted_";
//             break;
//         case "I_really_dont_want_to_talk_about_that":
//             queryFufillmentText = "I_really_dont_want_to_talk_about_it";
//             break;
//         case "I_wish_they_would_just_ignore_me_Ive_never_been_a_bad_student_but_they_keep_picking_on_me_Its_like_they_hate_me_They_keep_asking_me_the_hardest_questions_in_the_class_and_sometimes_I_just_dont_know_the_answer_so_I_sit_there_mumbling_something_Its_humiliating_And_then_everybody_laughs_at_me":
//             queryFufillmentText = "I_wish_they_would_just_ignore_me_Ive_never_been_a_bad_student_but_they_keep_picking_on_me_Its_like_they_hate_me_They_keep_asking_me_the_hardest_questions_in_the_class_and_sometimes_I_just_dont_know";
//             break;
//         case "In_video_games_I_can_escape_from_whats_going_on_around_me_be_who_I_want_to_be_and_choose_where_I_want_to_be_I_also_like_the_competition_Theres_so_many_different_types_of_games_I_can_choose_from_and_I_have_all_the_activities_I_need_in_one_place_I_dont_even_have_to_leave_my_room":
//             queryFufillmentText = "In_video_games_I_can_escape_from_whats_going_on_around_me_be_who_I_want_to_be_and_choose_where_I_want_to_be_I_also_like_the_competition_Theres_so_many_different_types_of_games_I_can_choose_from_and";
//             break;
//         case "My_mom_works_in_a_bank_and_my_father_is_a_store_manager_at_AT&T":
//             queryFufillmentText = "My_mom_works_in_a_bank_and_my_father_is_a_store_manager_at_ATandT";
//             break;
//         case "Yeah_He_is_a_store_manager_at_AT&T":
//             queryFufillmentText = "Yeah_He_is_a_store_manager_at_ATandT";
//             break;
//         case "He_is_a_store_manager_at_AT&T":
//             queryFufillmentText = "He_is_a_store_manager_at_ATandT";
//             break;
//     }

//     return queryFufillmentText;
// }




dfMessenger.addEventListener('df-request-sent', function (event) {
    document.getElementById('potentialquestions').style.display = 'none';
    document.getElementById("questionList").innerHTML = "";
    potentialQuestions.length = 0;
    chatGPTPending = false;
    gptCalled = false;
});


function switchIdle() {
    /* Switch between a preloaded idle video and the newly loaded video to remove white flash*/
    var em = document.getElementById("myVideo");
    var temp = window.getComputedStyle(em).getPropertyValue("opacity");

    if (temp == "1") {
        document.getElementById("idleVideo").style.opacity = "1";
        document.getElementById("myVideo").style.opacity = "0";
    }

    if (temp == "0") {
        document.getElementById("myVideo").style.opacity = "1";
        document.getElementById("idleVideo").style.opacity = "0";
    }

    //If you have found half the discoveries then queue the empathetic opportunity
    if (DiscoveriesFound.length >= (DiscoveryIntents.length) / 2 & EOdisplayed == false) {
        renderCard();
    }
}

//Log the message list using this function
function logMessageList() {
    console.log(document.querySelector("body > df-messenger").shadowRoot.querySelector("div > df-messenger-chat").shadowRoot.querySelector("div > df-message-list").shadowRoot.querySelector("#messageList").childNodes);
}

//Add Parameter to Change Video Based on Intent Name
function changeVid(URL) {
    var vid = document.getElementById("myVideo");

    if(URL.includes("mumble_gpt")){
        vid.src = "Jack_Videos/mumble_gpt.mp4";
        vid.muted = true;
    }
    else{
        vid.src = URL;
        vid.muted = false;
    }
    
    vid.load();
    vid.play();
    document.getElementById("myVideo").style.opacity = "1";
    document.getElementById("idleVideo").style.opacity = "0";
}
/*
FOR PIPING DISCOVERIES TO QUALTRICS FOR AUTOMATIC FEEDBACK
For each discovery in the scenario you need an if statement that corresponds to the Question ID (QID_) and ChoiceID (if T/F question 1 is true)
Check the array to see if the discovery was made if so then add it to the Q_PopulateResponse string that is appended to your qualtrics link
Note: Only values explicitly added to the string will be set so it is a good idea to set 
*/
function redirectPage() {
    //handleAuthClick();
    let fileData = CreateLogFile();
    //sendFileToGoogleDrive(fileData[0], fileData[1]);
    //generateAndUploadFile();
    document.getElementById('noah-finish').style.display = 'block';
}

function renderCard() {
    EOdisplayed = true;
    document.querySelector('df-messenger');
    const payload = [
        {
            "type": "info",
            "title": "Empathetic Opportunity",
            "subtitle": "The following is an empathetic opportunity. These are specific moments during your interaction in which you have a chance to be empathetic. Read the following response from the patient and respond accordingly.",
            "image": {
                "src": {
                    "rawUrl": "./empathyIconLarge.png"
                }
            },
            "event": {
                "name": "EO",
                "languageCode": "en",
                "parameters": {}
            }
        }];

    dfMessenger.renderCustomCard(payload);
    dfMessenger.renderCustomText('I know I have swallowing problems and tremors and eating is difficult. But I have seen other people with Parkinson\'s at my neurologist\'s office who are much, much worse. Some of them can only drink liquids and they need somebody to help them with that too. So I think I really shouldn\'t be complaining.');
    var videoURL = "https://agsdialogflow.s3.amazonaws.com/jack_dialogflow/Jack_Videos/EO_Jack.mp4"
    changeVid(videoURL);
    //set a variable to indicate I need to save the user's empathetic response in the listener
    EOR2Save = true;
}