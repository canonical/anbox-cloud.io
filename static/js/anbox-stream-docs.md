# Anbox Stream SDK

The Anbox Stream SDK is a javascript library you can plug in your website
to easily establish a video stream of your Anbox instances.

### Usage

Include the script

```html
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>

    <script async src="path/to/anbox-stream-sdk.js"></script>

</head>
<body></body>
</html>
```


Create a node element with an ID

```html
<div id="anbox-stream"></div>
``` 

and create a stream instance

```javascript
/**
 * AnboxStream creates a connection between your client and an Android instance and
 * displays its video & audio feed in an HTML5 player
 *
 * @param options: {object} {
 *       targetElement: ID of the DOM element to attach the video to. (required)
 *       url: Address of the service. (required)
 *       authToken: Authentication token acquired through /1.0/login (required)
 *       stunServers: List ICE servers (default: [{"urls": ['stun:stun.l.google.com:19302'], username: "", password: ""}])
 *       session: {
 *           app: Android application ID or name. (required)
 *       },
 *       screen: {
 *           width: screen width (default: 1280)
 *           height: screen height (default: 720)
 *           fps: screen frame rate (default: 60)
 *           density: screen density (default: 240)
 *       },
 *       controls: {
 *          keyboard: true or false, send keypress events to the Android instance. (default: true)
 *          mouse: true or false, send mouse and touch events to the Android instance. (default: true)
 *          gamepad: true or false, send gamepad events to the Android instance. (default: true)
 *      },
 *      callbacks: {
 *          ready: function, called when the video and audio stream are ready to be inserted. (default: none)
 *          error: function, called on stream error with the message as parameter. (default: none)
 *          done: function, called when the stream is closed. (default: none)
 *      }
 *   }
 */

let stream = new AnboxStream({
    targetElement: "anbox-stream",
    url: config.backendAddress,
    authToken: "abc123",
    session: {
        app: "some-application-name",
    },
    screen: {
        width: 720,
        height: 1280,
    },
    callbacks: {
        ready: () => { console.log('video stream is ready') },
        error: (e) => { console.log('an error occurred:', e) },
        done: () => { console.log('stream has been closed') },
    },
});

stream.connect();    
```
