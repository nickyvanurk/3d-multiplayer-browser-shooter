class NetworkManager {
    constructor(client) {
        this.client = client;
    }

    init(websocketAddress) {
        this.ws = new WebSocket(websocketAddress);
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
        let msg = JSON.parse(event.data);

        switch (msg.type) {
            case 'initClient': this.client.onInitClient(msg); break;
            case 'initWorld': this.client.onInitWorld(msg); break;
            case 'message': this.client.onMessage(msg); break;
            case 'addPlayer': this.client.onAddPlayer(msg); break;
            case 'removePlayer': this.client.onRemovePlayer(msg); break;
            case 'addBullet': this.client.onAddBullet(msg); break;
            case 'removeBullet': this.client.onRemoveBullet(msg); break;
            case 'worldState': this.client.onWorldState(msg); break;
        }
    }

    send(dataObj) {
        this.ws.send(JSON.stringify(dataObj));
    }
};

export default NetworkManager;
