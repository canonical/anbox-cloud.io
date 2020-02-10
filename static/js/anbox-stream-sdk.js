// Anbox Stream SDK
// Copyright 2019 Canonical Ltd.  All rights reserved.

class AnboxStream {
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
    constructor(options) {
        if (this._nullOrUndef(options))
            throw new Error('invalid options');

        this._fillDefaults(options);
        this._validateOptions(options);
        this._options = options;

        this._id = Math.random().toString(36).substr(2, 9);
        this._containerID = options.targetElement;
        this._videoID = 'anbox-stream-video-' + this._id;
        this._audioID = 'anbox-stream-audio-' + this._id;

        // WebRTC
        this._ws = null; // WebSocket
        this._pc = null; // PeerConnection
        this._controlChan = null; // Channel to send inputs
        this._timedout = false;
        this._timer = -1;
        this._ready = false;

        // Media streams
        this._videoStream = null;
        this._audioStream = null;

        // Control options
        this._modifierState = 0;
        this._dimensions = null;
        this._gamepadManager = null;
    };

    /**
     * Connect a new instance for the configured application or attach to an existing one
     */
    connect() {
        // We first have to check if an instance for the application already
        // exists. If we already have one we attach to the existing instance.
        // Otherwise we create a new instance for the application.
        fetch(this._options.url + '/1.0/instances/', {
            method: 'GET',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Authorization': 'Macaroon root=' + this._options.authToken,
                'Content-Type': 'application/json',
            },
        })
        .then(response => {
            if (response.status !== 200)
                throw new Error("Failed to retrieve list of instances");

            return response.json();
        })
        .then(jsonResp => {
            if (jsonResp.status !== "success")
                throw new Error(jsonResp.error);

            var instanceID = "";
            for (var n = 0; n < jsonResp.metadata.length; n++) {
                var instance = jsonResp.metadata[n];
                if (instance.application === this._options.session.app) {
                    instanceID = instance.id;
                    break;
                }
            }

            if (instanceID.length === 0) {
                this._createNewInstance();
                return;
            }

            this._attachToInstance(instanceID);
        })
        .catch(error => {
            this._options.callbacks.error(error);
        });
    };

    _attachToInstance(instanceID) {
        const details = {
            screen: {
                width: this._options.screen.width,
                height: this._options.screen.height,
                fps: this._options.screen.fps,
                density: this._options.screen.density,
            }
        }
        fetch(this._options.url + '/1.0/instances/' + instanceID + '/join', {
            method: 'POST',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Authorization': 'Macaroon root=' + this._options.authToken,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(details),
        })
        .then(response => {
            if (response.status !== 200)
                throw new Error("Failed to join instance");

            return response.json();
        })
        .then(jsonResp => {
            if (jsonResp.status !== "success")
                throw new Error(jsonResp.error)

            // If we received any additional STUN/TURN servers from the gateway use them
            if (jsonResp.metadata.stun_servers.length > 0)
                this._options.stunServers.concat(jsonResp.metadata.stun_servers);

            this._connectSignaler(jsonResp.metadata.websocket_url);
        })
        .catch(error => {
            this._options.callbacks.error(error);
        })
    }

    _createNewInstance() {
        const details = {
            name: this._options.session.app,
            application: this._options.session.app,
        }

        fetch(this._options.url + '/1.0/instances/', {
            method: 'POST',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Authorization': 'Macaroon root=' + this._options.authToken,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(details),
        })
        .then(response => {
            if (response.status !== 200)
                throw new Error("Failed to create new instance");

            return response.json();
        })
        .then(jsonResp => {
            if (jsonResp.status !== "success")
                throw new new Error(jsonResp.error);

            this._attachToInstance(jsonResp.metadata.id);
        })
        .catch(error => {
            this._options.callbacks.error(error);
        });
    }

    _connectSignaler(url) {
        let ws = new WebSocket(url);
        ws.onopen = this._onWsOpen.bind(this);
        ws.onclose = this._onWsClose.bind(this);
        ws.onerror = this._onWsError.bind(this);
        ws.onmessage = this._onWsMessage.bind(this);

        this._ws = ws;
        this._timer = window.setTimeout(this._onTimeout.bind(this), 2 * 60 * 1000);
    }

    /**
     * Disconnect an existing stream and remove the video & audio elements.
     *
     * This will stop the underlying Android instance.
     */
    disconnect() {
        this._stopStreaming();
    };

    /**
     * Toggle fullscreen for the streamed video.
     *
     * IMPORTANT: fullscreen can only be toggled following a user input.
     * If you call this method when your page loads, it will not work.
     */
    requestFullscreen() {
        if (!document.fullscreenEnabled) {
            console.error("fullscreen not supported");
        } else {
            const video = document.getElementById(this._videoID);
            if (video.requestFullscreen) {
                video.requestFullscreen();
            } else if (video.mozRequestFullScreen) { /* Firefox */
                video.mozRequestFullScreen();
            } else if (video.webkitRequestFullscreen) { /* Chrome, Safari and Opera */
                video.webkitRequestFullscreen();
            } else if (video.msRequestFullscreen) { /* IE/Edge */
                video.msRequestFullscreen();
            }
        }
    };

    /**
     * Exit fullscreen mode.
     */
    exitFullscreen() {
        document.exitFullscreen();
    };

    /**
     * Return the stream ID you can use to access video and audio elements with getElementById
     */
    getId() {
        return this._id;
    }

    _fillDefaults(options) {
        if (this._nullOrUndef(options.screen))
            options.screen = {};

        if (this._nullOrUndef(options.screen.width))
            options.screen.width = 1280;

        if (this._nullOrUndef(options.screen.height))
            options.screen.height = 720;

        if (this._nullOrUndef(options.screen.fps))
            options.screen.fps = 60;

        if (this._nullOrUndef(options.screen.density))
            options.screen.density = 240;

        if (this._nullOrUndef(options.controls))
            options.controls = {};

        if (this._nullOrUndef(options.controls.key))
            options.controls.keyboard = true;

        if (this._nullOrUndef(options.controls.mouse))
            options.controls.mouse = true;

        if (this._nullOrUndef(options.controls.gamepad))
            options.controls.gamepad = true;

        if (this._nullOrUndef(options.stunServers))
            options.stunServers = [{ urls: ['stun:stun.l.google.com:19302'], username: "", password: ""}];

        if (this._nullOrUndef(options.callbacks))
            options.callbacks = {};

        if (this._nullOrUndef(options.callbacks.ready))
            options.callbacks.ready = () => {};

        if (this._nullOrUndef(options.callbacks.error))
            options.callbacks.error = () => {};

        if (this._nullOrUndef(options.callbacks.done))
            options.callbacks.done = () => {};
    };

    _validateOptions(options) {
        // Required
        if (this._nullOrUndef(options.targetElement))
            throw new Error('missing targetElement parameter');
        if (document.getElementById(options.targetElement) === null) {
            throw new Error(`target element "${options.targetElement}" does not exist`)
        }

        if (this._nullOrUndef(options.authToken))
            throw new Error('missing authToken parameter');

        if (this._nullOrUndef(options.session))
            throw new Error('missing session parameter');

        if (this._nullOrUndef(options.session.app))
            throw new Error('missing session.app parameter');

        if (this._nullOrUndef(options.url))
            throw new Error('missing url parameter');

        if (!options.url.includes('https') && !options.url.includes('http'))
            throw new Error('unsupported scheme');
    }

    _insertMedia(videoSource, audioSource) {
        this._ready = true;
        let mediaContainer = document.getElementById(this._containerID);

        const video = document.createElement('video');
        video.srcObject = videoSource;
        video.muted = true;
        video.autoplay = true;
        video.controls = false;
        video.id = this._videoID;

        const audio = document.createElement('audio');
        audio.id = this._audioID;
        audio.srcObject = audioSource;
        audio.autoplay = true;
        audio.controls = false;

        mediaContainer.appendChild(video);
        mediaContainer.appendChild(audio);

        this._registerControls()
    };

    _removeMedia() {
        const video = document.getElementById(this._videoID);
        const audio = document.getElementById(this._audioID);

        if (video)
            video.remove();
        if (audio)
            audio.remove();
    };

    _stopStreaming() {
        if (this._pc !== null) {
            this._pc.close();
            this._pc = null;
        }
        if (this._ws !== null) {
            this._ws.close();
            this._ws = null;
        }
        this._removeMedia();
        this._unregisterControls();

        if (this._gamepadManager) {
            this._gamepadManager.stopPolling()
        }
        this._options.callbacks.done()
    };

    _onTimeout() {
        if (this._pc == null || this._pc.iceConnectionState === 'connected')
            return;

        this._timedout = true;
        this._stopStreaming();
    };

    _onRtcOfferCreated(description) {
        this._pc.setLocalDescription(description);
        let msg = {type: 'offer', sdp: btoa(description.sdp)};
        if (this._ws.readyState === 1)
            this._ws.send(JSON.stringify(msg))
    };

    _onRtcTrack(event) {
        const kind = event.track.kind;
        if (kind === 'video') {
            this._videoStream = event.streams[0];
            this._videoStream.onremovetrack = this._stopStreaming;
        } else if (kind === 'audio') {
            this._audioStream = event.streams[0];
            this._audioStream.onremovetrack = this._stopStreaming;
        }

        // Start streaming until audio and video tracks both are available
        if (this._videoStream && this._audioStream) {
            this._insertMedia(this._videoStream, this._audioStream)
            this._options.callbacks.ready();
        }
    };

    _onRtcIceConnectionStateChange() {
        if (this._pc === null)
            return;

        if (this._pc.iceConnectionState === 'failed') {
            this._stopStreaming();
            this._options.callbacks.error(new Error('Failed to establish a connection via ICE'));
        } else if (this._pc.iceConnectionState === 'disconnected' ||
            this._pc.iceConnectionState === 'closed') {
            if (this._timedout) {
                this._options.callbacks.error(new Error('Connection timed out'));
                return;
            }
            this._options.callbacks.error(new Error('Connection lost'));
            this._stopStreaming();
        } else if (this._pc.iceConnectionState === 'connected') {
            window.clearTimeout(this._timer);
            this._ws.close();
        }
    };

    _onRtcIceCandidate(event) {
        if (event.candidate !== null && event.candidate.candidate !== "") {
            const msg = {
                type: 'candidate',
                candidate: btoa(event.candidate.candidate),
                sdpMid: event.candidate.sdpMid,
                sdpMLineIndex: event.candidate.sdpMLineIndex,
            };
            if (this._ws.readyState === 1)
                this._ws.send(JSON.stringify(msg));
        }
    };

    _registerControls() {
        const v = document.getElementById(this._videoID);

        if (this._options.controls.mouse) {
            if (window.matchMedia('(pointer:fine)')) {
                v.addEventListener('mousemove', this._onMouseMove.bind(this));
                v.addEventListener('mousedown', this._onMouseButton.bind(this));
                v.addEventListener('mouseup', this._onMouseButton.bind(this));
                v.addEventListener('touchstart', this._onTouchStart.bind(this));
                v.addEventListener('touchend', this._onTouchEnd.bind(this));
                v.addEventListener('touchcancel', this._onTouchCancel.bind(this));
                v.addEventListener('touchmove', this._onTouchMove.bind(this));
                v.addEventListener('resize', this._refreshWindowMath.bind(this));
            } else
                console.warn("Device does not have mouse support")
        }

        if (this._options.controls.keyboard) {
            window.addEventListener('keydown', this._onKey.bind(this));
            window.addEventListener('keyup', this._onKey.bind(this));
            window.addEventListener('gamepadconnected', this._queryGamePadEvents.bind(this));
        }

        if (this._options.controls.keyboard || this._options.controls.mouse) {
            // Call it once for the initial values and refresh it every time the window
            // or video element is resized
            this._refreshWindowMath();
            window.addEventListener('resize', this._refreshWindowMath.bind(this));
        }
    };

    _unregisterControls() {
        const v = document.getElementById(this._videoID);

        // Removing the video container should automatically remove all event listeners
        // but this is dependant on the garbage collector, so we manually do it if we can
        if (v) {
            v.removeEventListener('mousemove', this._onMouseMove);
            v.removeEventListener('mousedown', this._onMouseButton);
            v.removeEventListener('mouseup', this._onMouseButton);
            v.removeEventListener('touchstart', this._onTouchStart);
            v.removeEventListener('touchend', this._onTouchEnd);
            v.removeEventListener('touchcancel', this._onTouchCancel);
            v.removeEventListener('touchmove', this._onTouchMove);
            v.removeEventListener('resize', this._refreshWindowMath);
        }

        window.removeEventListener('resize', this._refreshWindowMath.bind(this));
        window.removeEventListener('keydown', this._onKey.bind(this));
        window.removeEventListener('keyup', this._onKey.bind(this));
        window.removeEventListener('gamepadconnected', this._queryGamePadEvents.bind(this));
    };

    _clientToServerX(clientX, d) {
        let serverX = Math.round((clientX - d.containerOffsetX) * d.scalingFactorX);
        if (serverX === d.frameW - 1) serverX = d.frameW;
        if (serverX > d.frameW) serverX = d.frameW;
        if (serverX < 0) serverX = 0;
        return serverX;
    };

    _clientToServerY(clientY, m) {
        let serverY = Math.round((clientY - m.containerOffsetY) * m.scalingFactorY);
        if (serverY === m.frameH - 1) serverY = m.frameH;
        if (serverY > m.frameH) serverY = m.frameH;
        if (serverY < 0) serverY = 0;
        return serverY;
    };

    _triggerModifierEvent(event, key) {
        if (event.getModifierState(key)) {
            if (!(this._modifierState & _modifierEnum[key])) {
                this._modifierState = this._modifierState | _modifierEnum[key];
                this._sendEvent('key', {code: _keyScancodes[key], pressed: true});
            }
        } else {
            if ((this._modifierState & _modifierEnum[key])) {
                this._modifierState = this._modifierState & ~_modifierEnum[key];
                this._sendEvent('key', {code: _keyScancodes[key], pressed: false});
            }
        }
    };

    _sendEvent(type, data) {
        if (this._pc === null || this._controlChan.readyState !== 'open')
            return;
        this._controlChan.send(JSON.stringify({type: 'input::' + type, data: data}));
    };

    _refreshWindowMath() {
        let video = document.getElementById(this._videoID);

        // timing issues can occur when removing the component
        if (!video) {
            return
        }

        const windowW = video.offsetWidth;
        const windowH = video.offsetHeight;
        const frameW = video.videoWidth;
        const frameH = video.videoHeight;

        const multi = Math.min(windowW / frameW, windowH / frameH);
        const vpWidth = frameW * multi;
        const vpHeight = frameH * multi;

        this._dimensions = {
            scalingFactorX: frameW / vpWidth,
            scalingFactorY: frameH / vpHeight,
            containerOffsetX: Math.max((windowW - vpWidth) / 2.0, 0),
            containerOffsetY: Math.max((windowH - vpHeight) / 2.0, 0),
            frameW,
            frameH,
        };
    };

    _onMouseMove(event) {
        const x = this._clientToServerX(event.offsetX, this._dimensions);
        const y = this._clientToServerY(event.offsetY, this._dimensions);
        this._sendEvent('mouse-move', {x: x, y: y, rx: event.movementX, ry: event.movementY})
    };

    _onMouseButton(event) {
        const down = event.type === 'mousedown';
        let button;

        if (down && event.button === 0 && event.ctrlKey && event.shiftKey)
            return;

        switch (event.button) {
            case 0: button = 1; break;
            case 1: button = 2; break;
            case 2: button = 3; break;
            case 3: button = 4; break;
            case 4: button = 5; break;
            default: break;
        }

        this._sendEvent('mouse-button', {button: button, pressed: down})
    };

    _onKey(event) {
        // Disable any problematic browser shortcuts
        if (event.code === 'F5' || // Reload
            (event.code === 'KeyR' && event.ctrlKey) || // Reload
            (event.code === 'F5' && event.ctrlKey) || // Hard reload
            (event.code === 'KeyI' && event.ctrlKey && event.shiftKey) ||
            (event.code === 'F11') || // Fullscreen
            (event.code === 'F12') // Developer tools
        ) return;

        event.preventDefault();

        const code = _keyScancodes[event.code];
        const pressed = (event.type === 'keydown');
        if (code) {
            // NOTE: no need to check the following modifier keys
            // 'ScrollLock', 'NumLock', 'CapsLock'
            // as they're mapped to event.code correctly
            const modifierKeys = ['Control', 'Shift', 'Alt', 'Meta', 'AltGraph'];
            for (let i = 0; i < modifierKeys.length; i++) {
                this._triggerModifierEvent(event, modifierKeys[i]);
            }

            this._sendEvent('key', {code: code, pressed: pressed});
        }
    };

    _touchEvent(event, eventType) {
        event.preventDefault();
        for (let n = 0; n < event.changedTouches.length; n++) {
            let touch = event.changedTouches[n];
            let x = this._clientToServerX(touch.clientX, this._dimensions);
            let y = this._clientToServerY(touch.clientY, this._dimensions);
            this._sendEvent(eventType, {id: n, x: x, y: y});
        }
    };

    _onTouchStart(event) {this._touchEvent(event, 'touch-start')};
    _onTouchEnd(event) {this._touchEvent(event, 'touch-end')};
    _onTouchCancel(event) {this._touchEvent(event, 'touch-cancel')};
    _onTouchMove(event) {this._touchEvent(event, 'touch-move')};

    _queryGamePadEvents() {
        if (!this._options.controls.gamepad)
            return;
        let gamepads = navigator.getGamepads();
        if (gamepads.length > 0) {
            this._gamepadManager = new _gamepadEventManager(this._sendEvent.bind(this));
            this._gamepadManager.startPolling()
        }
    };

    _nullOrUndef(obj) { return obj === null || obj === undefined };

    _onWsOpen() {
        const config = { iceServers: this._options.stunServers };
        this._pc = new RTCPeerConnection(config);
        this._pc.ontrack = this._onRtcTrack.bind(this);
        this._pc.oniceconnectionstatechange = this._onRtcIceConnectionStateChange.bind(this);
        this._pc.onicecandidate = this._onRtcIceCandidate.bind(this);

        this._controlChan = this._pc.createDataChannel('control');
        let options = {offerToReceiveVideo: true, offerToReceiveAudio: true};
        this._pc.createOffer(options).then(this._onRtcOfferCreated.bind(this)).catch(function(err) {
            console.error(err)
        });
    };

    _onWsClose() {
        if (!this._ready) {
            this._options.callbacks.error(new Error('Connection was interrupted while connecting'));
        }
    };

    _onWsError(event) {
        if (event.type === 'error') {
            this._stopStreaming();
        }
        this._options.callbacks.error(new Error('failed to communicate with backend service'));
    };

    _onWsMessage(event) {
        const msg = JSON.parse(event.data);
        if (msg.type === 'answer') {
            this._pc.setRemoteDescription(new RTCSessionDescription({type: 'answer', sdp: atob(msg.sdp)}));
        } else if (msg.type === 'candidate') {
            this._pc.addIceCandidate({'candidate': atob(msg.candidate), 'sdpMLineIndex': msg.sdpMLineIndex, 'sdpMid': msg.sdpMid})
        } else {
            console.log('Unknown message type ' + msg.type)
        }
    };
}


class _gamepadEventManager {
    constructor(sendEvent) {
        this._polling = false;
        this._state = {};
        this._dpad_remap_start_index = 6;
        this._dpad_standard_start_index = 12;
        this._sendEvent = sendEvent
    }

    startPolling() {
        if (this._polling === true)
            return;

        // Since chrome only supports event polling and we don't want
        // to send any gamepad events to Android isntance if the state
        // of any button or axis of gamepad is not changed. Hence we
        // cache all keys state whenever it gets connected and provide
        // event-driven gamepad events mechanism for gamepad events processing.
        let gamepads = navigator.getGamepads();
        for (let i = 0; i < gamepads.length; i++) {
            if (gamepads[i])
                this.cacheState(gamepads[i]);
        }

        this._polling = true;
        this.tick()
    };

    stopPolling() {
        if (this._polling === true)
            this._polling = false;
    };

    tick() {
        this.queryEvents();
        if (this._polling)
            window.requestAnimationFrame(this.tick.bind(this));
    };

    queryEvents() {
        let gamepads = navigator.getGamepads();
        for (let i = 0; i < gamepads.length; i++) {
            let gamepad = gamepads[i];
            if (gamepad) {
                // A new gamepad is added
                if (!this._state[gamepad])
                    this.cacheState(gamepad);
                else {
                    const buttons = gamepad.buttons;
                    const cacheButtons = this._state[gamepad].buttons;
                    for (let j = 0; j < buttons.length; j++) {
                        if (cacheButtons[j].pressed !== buttons[j].pressed) {
                            // Check the table at the following link that describes the buttons/axes
                            // index and their physical locations.
                            this._sendEvent('gamepad-button', {id: gamepad.index, index: j, pressed: buttons[j].pressed});
                            cacheButtons[j].pressed = buttons[j].pressed;
                        }
                    }

                    // NOTE: For some game controllers, E.g. PS3 or Xbox 360 controller, DPAD buttons
                    // were translated to axes via html5 gamepad APIs and located in gamepad.axes array
                    // indexed starting from 6 to 7.
                    // When a DPAD button is pressed/unpressed, the corresponding value as follows
                    //
                    //     Button         |  Index  |   Pressed   |   Unpressed   |
                    // DPAD_LEFT_BUTTON   |    6    |      -1     |        0      |
                    // DPAD_RIGHT_BUTTON  |    6    |       1     |        0      |
                    // DPAD_UP_BUTTON     |    7    |      -1     |        0      |
                    // DPAD_DOWN_BUTTON   |    7    |       1     |        0      |
                    //
                    // When the above button was pressed/unpressed, we will send the gamepad-button
                    // event instead.
                    const axes = gamepad.axes;
                    let dpad_button_index = 0;
                    const cacheAxes = this._state[gamepad].axes;
                    for (let k = 0; k < axes.length; k++) {
                        if (cacheAxes[k] !== axes[k]) {
                            switch (true) {
                                case k < this._dpad_remap_start_index:  // Standard axes
                                    this._sendEvent('gamepad-axes', {id: gamepad.index, index: k, value: axes[k]});
                                    break;
                                case k === this._dpad_remap_start_index: // DPAD left and right buttons
                                    if (axes[k] === 0) {}
                                    else if (axes[k] === -1) {
                                        dpad_button_index = this._dpad_standard_start_index + 2;
                                    } else {
                                        dpad_button_index = this._dpad_standard_start_index + 3;
                                    }

                                    this._sendEvent('gamepad-button', {
                                        id: gamepad.index,
                                        index: dpad_button_index,
                                        pressed: axes[k] !== 0
                                    });
                                    break;
                                case k === this._dpad_remap_start_index + 1: //  DPAD up and down buttons
                                    if (axes[k] === 0) {}
                                    else if (axes[k] === -1) {
                                        dpad_button_index = this._dpad_standard_start_index;
                                    } else {
                                        dpad_button_index = this._dpad_standard_start_index + 1;
                                    }

                                    this._sendEvent('gamepad-button', {
                                        id: gamepad.index,
                                        index: dpad_button_index,
                                        pressed: axes[k] !== 0
                                    });
                                    break;
                                default:
                                    console.log("Unsupported axes index", k);
                                    break;
                            }
                            cacheAxes[k] = axes[k]
                        }
                    }
                }
            }
        }
    };

    cacheState(gamepad) {
        if (!gamepad)
            return;

        const gamepadState = {};
        const buttons = gamepad.buttons;
        for (let index = 0; index < buttons.length; index++) {
            let buttonState = {
                pressed: buttons[index].pressed
            };
            if (gamepadState.buttons)
                gamepadState.buttons.push(buttonState);
            else
                gamepadState.buttons = [buttonState];
        }

        const axes = gamepad.axes;
        for (let index = 0; index < axes.length; index++) {
            if (gamepadState.axes)
                gamepadState.axes.push(axes[index]);
            else
                gamepadState.axes = [axes[index]];
        }

        this._state[gamepad] = gamepadState;
    }
}

const _keyScancodes = {
    KeyA: 4,
    KeyB: 5,
    KeyC: 6,
    KeyD: 7,
    KeyE: 8,
    KeyF: 9,
    KeyG: 10,
    KeyH: 11,
    KeyI: 12,
    KeyJ: 13,
    KeyK: 14,
    KeyL: 15,
    KeyM: 16,
    KeyN: 17,
    KeyO: 18,
    KeyP: 19,
    KeyQ: 20,
    KeyR: 21,
    KeyS: 22,
    KeyT: 23,
    KeyU: 24,
    KeyV: 25,
    KeyW: 26,
    KeyX: 27,
    KeyY: 28,
    KeyZ: 29,
    Digit1: 30,
    Digit2: 31,
    Digit3: 32,
    Digit4: 33,
    Digit5: 34,
    Digit6: 35,
    Digit7: 36,
    Digit8: 37,
    Digit9: 38,
    Digit0: 39,
    Enter: 40,
    Escape: 41,
    Backspace: 42,
    Tab: 43,
    Space: 44,
    Minus: 45,
    Equal: 46,
    BracketLeft: 47,
    BracketRight: 48,
    Backslash: 49,
    Semicolon: 51,
    Comma: 54,
    Period: 55,
    Slash: 56,
    CapsLock: 57,
    F1: 58,
    F2: 59,
    F3: 60,
    F4: 61,
    F5: 62,
    F6: 63,
    F7: 64,
    F8: 65,
    F9: 66,
    F10: 67,
    F11: 68,
    F12: 69,
    PrintScreen: 70,
    ScrollLock: 71,
    Pause: 72,
    Insert: 73,
    Home: 74,
    PageUp: 75,
    Delete: 76,
    End: 77,
    PageDown: 78,
    ArrowRight: 79,
    ArrowLeft: 80,
    ArrowDown: 81,
    ArrowUp: 82,
    Control: 83,
    Shift: 84,
    Alt: 85,
    Meta: 86,
    AltGraph: 87,
    NumLock: 88,
};

const _modifierEnum = {
    Control: 0x1,
    Shift: 0x2,
    Alt: 0x4,
    Meta: 0x8,
    AltGraph: 0x10,
};

export default AnboxStream;
