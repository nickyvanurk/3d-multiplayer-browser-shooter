const command = {
    setName: 0,
    inputState: 1,
    message: 2
};

class NetworkManager {
    constructor(client) {
        this.client = client;
    }

    init(websocketAddress) {
        this.ws = new WebSocket(websocketAddress);
        this.ws.binaryType = 'arraybuffer';
        this.ws.onopen = this.onConnection.bind(this);
        this.ws.onmessage = this.processServerMessages.bind(this);
    }

    onConnection() {
        // TODO: Create HUD class
        this.client.chatStatus.textContent = 'Choose name:';
        this.client.chatInput.removeAttribute('disabled');
        this.client.chatInput.focus();
    }

    processServerMessages(event) {
        if (typeof event.data === 'string') {
            let msg = JSON.parse(event.data);

            switch (msg.type) {
                case 'initClient': this.client.onInitClient(msg); break;
                case 'initWorld': this.client.onInitWorld(msg); break;
                case 'message': this.client.onMessage(msg); break;
                case 'addPlayer': this.client.onAddPlayer(msg); break;
                case 'removePlayer': this.client.onRemovePlayer(msg); break;
                case 'addBullet': this.client.onAddBullet(msg); break;
                case 'removeBullet': this.client.onRemoveBullet(msg); break;
            }
        } else {
            this.client.onWorldState(event.data);
        }
    }

    sendName(name) {
        this.send({type: 'setName', name});
    }

    sendInputState(inputState) {
        const num_elements = 1 + inputState.length;

        const buffer = new ArrayBuffer(num_elements * 4);
        const array = new Float32Array(buffer);

        array[0] = command.inputState;

        for (let i = 0; i < inputState.length; i++) {
            array[i+1] = inputState[i];
        }

        this.ws.send(array);
    }

    sendChatMessage(message) {
        this.send({
            type: 'msg',
            content: message,
            time: +new Date()
        });
    }

    send(dataObj) {
        this.ws.send(JSON.stringify(dataObj));
    }
};

export default NetworkManager;
