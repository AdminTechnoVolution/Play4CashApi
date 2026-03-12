module.exports = (socket, namespace) => {
    // The /rooms namespace is exclusively for broadcasting real-time updates
    // about room creation, joining, and status changes from the REST API.
    // Clients connect to this namespace just to listen for events:
    // - 'roomCreated'
    // - 'roomUpdated'
    // - 'roomDeleted'
};
