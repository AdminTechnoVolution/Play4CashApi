const {
    getRooms: serviceGetRooms,
    getRoom: serviceGetRoom,
    createRoom: serviceCreateRoom,
    joinRoom: serviceJoinRoom,
    setReady: serviceSetReady,
    deleteRoom: serviceDeleteRoom,
    leaveRoom: serviceLeaveRoom,
    getRoomStatus: serviceGetRoomStatus,
} = require('../services/room.service');

const getRooms = async (req, res, next) => {
    try {
        res.status(200).json(await serviceGetRooms(req));
    } catch (err) { next(err); }
};

const getRoom = async (req, res, next) => {
    try {
        res.status(200).json(await serviceGetRoom(req));
    } catch (err) { next(err); }
};

const getRoomStatus = async (req, res, next) => {
    try {
        res.status(200).json(await serviceGetRoomStatus(req));
    } catch (err) { next(err); }
};


const createRoom = async (req, res, next) => {
    try {
        res.status(201).json(await serviceCreateRoom(req));
    } catch (err) { next(err); }
};

const joinRoom = async (req, res, next) => {
    try {
        res.status(200).json(await serviceJoinRoom(req));
    } catch (err) { next(err); }
};

const setReady = async (req, res, next) => {
    try {
        res.status(200).json(await serviceSetReady(req));
    } catch (err) { next(err); }
};

const deleteRoom = async (req, res, next) => {
    try {
        res.status(200).json(await serviceDeleteRoom(req));
    } catch (err) { next(err); }
};

const leaveRoom = async (req, res, next) => {
    try {
        res.status(200).json(await serviceLeaveRoom(req));
    } catch (err) { next(err); }
};

module.exports = { getRooms, getRoom, getRoomStatus, createRoom, joinRoom, setReady, deleteRoom, leaveRoom };
