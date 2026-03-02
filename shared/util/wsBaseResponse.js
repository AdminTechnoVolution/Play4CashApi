class WsResponse {
    static success(data = {}, messages = []) {
        return JSON.stringify({
            success: true,
            data,
            messages
        });
    }

    static error(data = {}, messages = []) {
        return JSON.stringify({
            success: false,
            data,
            messages
        });
    }
}

module.exports = WsResponse;
