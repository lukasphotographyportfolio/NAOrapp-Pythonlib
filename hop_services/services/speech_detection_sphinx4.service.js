/*!
 * @file speech_detection_sphinx4.service.js
 * @brief Speech-Detection hop front-end service.
 *
 * @bug Sometimes the websocket implementation from hop gets undefined before
 *   the onmessage event calls
 */


"use strict";


// TODO -- Load PLATFORM parameters from JSON file
// TODO -- Load ROS-Topics/Services names from parameter server (ROS)

var __DEBUG__ = false;

/*---------Sets required file Paths-------------*/
var user = process.env.LOGNAME;
var module_path = '../modules/';
/*----------------------------------------------*/

/*--------------Load required modules-----------*/
//var contents = require('../utilities/parameters.json');
var hop = require('hop');
var Fs = require( module_path + 'fileUtils.js' );
var RandStringGen = require ( module_path +
  'RandomStrGenerator/randStringGen.js' );
/*----------------------------------------------*/

/*-----<Defined Name of QR Node ROS service>----*/
var ros_service_name = '/rapp/rapp_speech_detection_sphinx4/batch_speech_to_text';
/*------------------------------------------------*/

/*----<Random String Generator configurations---->*/
var stringLength = 5;
var randStrGen = new RandStringGen( stringLength );
/*------------------------------------------------*/

/* -- Set timer values for websocket communication to rosbridge -- */
var timer_tick_value = 1000 // ms
var max_time = 15000 // ms
var max_tries = 2
//var max_timer_ticks = 1000 * max_time / tick_value;
/* --------------------------------------------------------------- */



var __hopServiceName = 'speech_detection_sphinx4';
var __hopServiceId = null;
var __masterId = null;
var __cacheDir = '~/.hop/cache/services/';

register_master_interface();


/*!
 * @brief Speech Detection (sphinx4) front-end Platform web-service
 * @param fileUrl
 * @param language
 * @param audio_source
 * @param words
 * @param sentences
 * @param grammar
 * @user
 */
service speech_detection_sphinx4(
  {file_uri: '', language: '', audio_source: '',
    words: [], sentences: [], grammar: [], user: ''
  }
  )
{
  postMessage( craft_slaveMaster_msg('log', 'client-request') );

  var logMsg = 'Audio data stored at [' + file_uri + ']';
  postMessage( craft_slaveMaster_msg('log', logMsg) );

  /* --< Perform renaming on the reived file. Add uniqueId value> --- */
  var unqCallId = randStrGen.createUnique();
  var fileUrl = file_uri.split('/');
  var fileName = fileUrl[fileUrl.length -1];

  var cpFilePath = __cacheDir + fileName.split('.')[0] + '-'  + unqCallId +
    '.' + fileName.split('.')[1];
  cpFilePath = Fs.resolve_path(cpFilePath);
  /* ---------------------------------------------------------------- */


  /* --------------------- Handle transferred file ------------------------- */
  if (Fs.copyFile(file_uri, cpFilePath) == false)
  {
    //could not rename file. Probably cannot access the file. Return to client!
    var logMsg = 'Failed to rename file: [' + file_uri + '] --> [' +
      cpFilePath + ']';

    postMessage( craft_slaveMaster_msg('log', logMsg) );
    //Fs.rm_file_sync(file_uri);

    // Dismiss the unique identity key
    randStrGen.removeCached(unqCallId);
    var resp_msg = craft_error_response();
    return resp_msg;
  }

  logMsg = 'Created copy of file ' + file_uri + ' at ' + cpFilePath;
  postMessage( craft_slaveMaster_msg('log', logMsg) );
  /*-------------------------------------------------------------------------*/

  //Asynchronous http response
  return hop.HTTPResponseAsync(
    function( sendResponse ) {

      /* ======== Create specific service arguments here ========= */
      var args = {
        'path': cpFilePath,
         'audio_source': audio_source,
         'words': JSON.parse(words),
         'sentences': JSON.parse(sentences),
         'grammar': JSON.parse(grammar),
         'language': language,
         'user': user
      };

      var rosbridge_connection = true;
      var respFlag = false;

      var rosbridge_msg = craft_rosbridge_msg(args, ros_service_name, unqCallId);

      /* ---- Catch exception while initiating websocket communication ----- */
      try{
        var rosWS = new WebSocket('ws://localhost:9090');

        // Register WebSocket.onopen callback
        rosWS.onopen = function(){
          rosbridge_connection = true;

          var logMsg = 'Connection to rosbridge established';
          postMessage( craft_slaveMaster_msg('log', logMsg) );

          this.send(JSON.stringify(rosbridge_msg));
        }

        // Register WebSocket.onclose callback
        rosWS.onclose = function(){
          var logMsg = 'Connection to rosbridge closed';
          postMessage( craft_slaveMaster_msg('log', logMsg) );
        }

        // Register WebSocket.message callback
        rosWS.onmessage = function(event){
          var logMsg = 'Received message from rosbridge';
          postMessage( craft_slaveMaster_msg('log', logMsg) );

          //console.log(event.value);
          Fs.rm_file_sync(cpFilePath);
          var resp_msg = craft_response( event.value ); // Craft response message

          this.close(); // Close websocket
          rosWS = undefined; // Ensure deletion of websocket
          respFlag = true; // Raise Response-Received Flag

          // Dismiss the unique rossrv-call identity  key for current client
          randStrGen.removeCached( unqCallId );
          sendResponse( resp_msg );
        }
      }
      catch(e){
        rosbridge_connection = false;
        //console.log(e);

        var logMsg = 'ERROR: Cannot open websocket' +
          'to rosbridge [ws//localhost:9090]\r\n' + e;
        postMessage( craft_slaveMaster_msg('log', logMsg) );

        Fs.rm_file_sync(cpFilePath);

        var resp_msg = craft_error_response;
        sendResponse( resp_msg );
        return;
      }
      /*------------------------------------------------------------------ */

      var timer_ticks = 0;
      var elapsed_time;
      var retries = 0;

      // Set Timeout wrapping function
      function asyncWrap(){
        setTimeout( function(){
          timer_ticks += 1;
          elapsed_time = timer_ticks * timer_tick_value;

          if (respFlag == true)
          {
            return;
          }
          else if (respFlag != true && elapsed_time > max_time ){
            timer_ticks = 0;
            retries += 1;

            var logMsg = 'Reached rosbridge response timeout' +
          '---> [' + elapsed_time + '] ms ... Reconnecting to rosbridge.' +
          'Retry-' + retries;
          postMessage( craft_slaveMaster_msg('log', logMsg) );

          if (retries > max_tries) // Reconnected for max_tries times
          {
            var logMsg = 'Reached max_retries [' + max_tries + ']' +
            ' Could not receive response from rosbridge...';
            postMessage( craft_slaveMaster_msg('log', logMsg) );

            Fs.rm_file_sync(cpFilePath);
            var respMsg = craft_error_response();

            //  Close websocket before return
            rosWS.close();
            rosWS = undefined;
            sendResponse( respMsg );
            return;
          }

          if (rosWS != undefined)
          {
            rosWS.close();
          }
          rosWS = undefined;

        /* --------------< Re-open connection to the WebSocket >--------------*/
          try{
            rosWS = new WebSocket('ws://localhost:9090');

            /* -----------< Redefine WebSocket callbacks >----------- */
            rosWS.onopen = function(){
              var logMsg = 'Connection to rosbridge established';
              postMessage( craft_slaveMaster_msg('log', logMsg) );
              this.send(JSON.stringify(rosbridge_msg));
            }

            rosWS.onclose = function(){
              var logMsg = 'Connection to rosbridge closed';
              postMessage( craft_slaveMaster_msg('log', logMsg) );
            }

            rosWS.onmessage = function(event){
              var logMsg = 'Received message from rosbridge';
              postMessage( craft_slaveMaster_msg('log', logMsg) );

              Fs.rm_file_sync(cpFilePath);
              var resp_msg = craft_response( event.value );
              //console.log(resp_msg);

              this.close(); // Close websocket
              rosWS = undefined; // Decostruct websocket
              respFlag = true;
              randStrGen.removeCached( unqCallId ); //Remove the unqCallId so it can be reused
              sendResponse( resp_msg ); //Return response to client
            }
          }
          catch(e){
            rosbridge_connection = false;
            //console.log(e);

            var logMsg = 'ERROR: Cannot open websocket' +
              'to rosbridge --> [ws//localhost:9090]\r\n' + e;
            postMessage( craft_slaveMaster_msg('log', logMsg) );

            Fs.rm_file_sync(cpFilePath);
            var resp_msg = craft_error_response();

            sendResponse( resp_msg );
            return;
          }
        }
        /*--------------------------------------------------------*/
        asyncWrap(); // Recall timeout function

        }, timer_tick_value); //Timeout value is set at 100 ms.
      }
      asyncWrap();
      /*==============================================================================================*/
    }, this );
};



/*!
 * @brief Crafts the form/format for the message to be returned
 * @param srvMsg Return message from ROS Service.
 * @return Message to be returned from the hop-service
 */
function craft_response(rosbridge_msg)
{
  var msg = JSON.parse(rosbridge_msg);
  var words = msg.values.words;
  var result = msg.result;
  var error = msg.values.error;

  var crafted_msg = { words: [], error: '' };

  var logMsg = '';

  if(result)
  {
    for (var ii = 0; ii < words.length; ii++)
    {
      crafted_msg.words.push( words[ii] )
    }
    crafted_msg.error = error;
    logMsg = 'Returning to client.';

    if (error != '')
    {
      logMsg += ' ROS service [' + ros_service_name + '] error'
        ' ---> ' + error;
    }
    else
    {
      logMsg += ' ROS service [' + ros_service_name + '] returned with success'
    }
  }
  else
  {
    logMsg = 'Communication with ROS service ' + ros_service_name +
      'failed. Unsuccesful call! Returning to client with error' +
      ' ---> RAPP Platform Failure';
    crafted_msg.error = 'RAPP Platform Failure';
  }

  postMessage( craft_slaveMaster_msg('log', logMsg) );

  //return crafted_msg;
  return JSON.stringify(crafted_msg)
};



/*!
 * @brief Crafts response message on Platform Failure
 */
function craft_error_response()
{
  // Add here to be returned literal
  var errorMsg = 'RAPP Platform Failure!'
    var crafted_msg = {words: [], error: errorMsg};

  var logMsg = 'Return to client with error --> ' + errorMsg;
  postMessage( craft_slaveMaster_msg('log', logMsg) );

  return JSON.stringify(crafted_msg);
}


/*!
 * @brief Crafts ready to send, rosbridge message.
 *   Can be used by any service!!!!
 */
function craft_rosbridge_msg(args, service_name, id){

  var rosbrige_msg = {
    'op': 'call_service',
    'service': service_name,
    'args': args,
    'id': id
  };

  return rosbrige_msg;
}


function register_master_interface()
{
  // Register onexit callback function
  onexit = function(e){
    console.log("Service [%s] exiting...", __hopServiceName);
    var logMsg = "Received termination command. Exiting.";
    postMessage( craft_slaveMaster_msg('log', logMsg) );
  }

  // Register onmessage callback function
  onmessage = function(msg){
    if (__DEBUG__)
    {
      console.log("Service [%s] received message from master process",
        __hopServiceName);
      console.log("Msg -->", msg.data);
    };

    var logMsg = 'Received message from master process --> [' +
      msg.data + ']';
    postMessage( craft_slaveMaster_msg('log', logMsg) );

    exec_master_command(msg.data);
  }

  // On initialization inform master and append to log file
  var logMsg = "Initiated worker";
  postMessage( craft_slaveMaster_msg('log', logMsg) );
}


function exec_master_command(msg)
{
  var cmd = msg.cmdId;
  var data = msg.data;
  switch (cmd)
  {
    case 2055:  // Set worker ID
      __hopServiceId = data;
      break;
    case 2050:
      __masterId = data;
      break;
    case 2065:
      __cacheDir = data;
      break;
    default:
      break;
  }
}


function craft_slaveMaster_msg(msgId, msg)
{
  var msg = {
    name: __hopServiceName,
    id:   __hopServiceId,
    msgId: msgId,
    data: msg
  }
  return msg;
}
