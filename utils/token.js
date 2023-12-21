const { sign } = require("jsonwebtoken");

const createTokenUser = (user) => {
	const accessToken = sign(
		{ id: user },
		process.env.JWT_SECRET_KEY,
		{ expiresIn: process.env.JWT_EXPIRE }
	);
	return accessToken;
};


const createTokenAdmin = (user) => {
	const accessToken = sign({ username: user }, process.env.JWT_SECRET_KEY, {
		expiresIn: process.env.JWT_EXPIRE,
	});
	return accessToken;
};
module.exports = { createTokenUser, createTokenAdmin };
