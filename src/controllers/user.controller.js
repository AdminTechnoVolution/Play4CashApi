const { ERROR_BAD_REQUEST_RESPONSE } = require('../../shared/util/constants');
const BusinessException = require('../../shared/exceptionHandler/BusinessException');
const {
  registerUser: serviceRegisterUser,
  verifyCodeUser: serviceVerifyCodeUser,
  registerWalletToUser: serviceRegisterWalletToUser,
  getUserAccount: serviceGetUserAccount,
  getUserHistory: serviceGetUserHistory,
  getTotalBalances: serviceGetTotalBalances
} = require('../services/user.service');

const getUserAccount = async (req, res, next) => {
  try {
    let jsonResponse = await serviceGetUserAccount(req);
    res.status(200).json(jsonResponse);
  } catch (err) {
    next(err);
  }
};

const registerUser = async (req, res, next) => {
  try {
    if (!req.body) throw new BusinessException(ERROR_BAD_REQUEST_RESPONSE);

    let jsonResponse = await serviceRegisterUser(req);
    res.status(200).json(jsonResponse);
  } catch (err) {
    next(err);
  }
};

const verifyCodeUser = async (req, res, next) => {
  try {
    if (!req.body) throw new BusinessException(ERROR_BAD_REQUEST_RESPONSE);

    let jsonResponse = await serviceVerifyCodeUser(req);
    res.status(200).json(jsonResponse);
  } catch (err) {
    next(err);
  }
};

const registerWalletToUser = async (req, res, next) => {
  try {
    if (!req.body) throw new BusinessException(ERROR_BAD_REQUEST_RESPONSE);
    let jsonResponse = await serviceRegisterWalletToUser(req);
    res.status(200).json(jsonResponse);
  } catch (err) {
    next(err);
  }
};

const getUserHistory = async (req, res, next) => {
  try {
    let jsonResponse = await serviceGetUserHistory(req);
    res.status(200).json(jsonResponse);
  } catch (err) {
    next(err);
  }
};

const getTotalBalances = async (req, res, next) => {
  try {
    let jsonResponse = await serviceGetTotalBalances(req);
    res.status(200).json(jsonResponse);
  } catch (err) {
    next(err);
  }
};

module.exports = { registerUser, verifyCodeUser, registerWalletToUser, getUserAccount, getUserHistory, getTotalBalances };
