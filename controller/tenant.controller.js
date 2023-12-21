const bcrypt = require("bcrypt");
const { createTokenUser } = require("../utils/token");
const { date_time } = require("../utils/date");
const puppeteer = require("puppeteer");
const path = require("path");

const db = require("../database/db");

const queryParam = async (sql, data) => {
	try {
		return (await db.promise().query(sql, [data]))[0];
	} catch (err) {
		throw err;
	}
};
const zeroParam = async (sql) => {
	try {
		return (await db.promise().query(sql))[0];
	} catch (err) {
		throw err;
	}
};
const getLogin = (req, res) => {
	res.render("signin");
};
const postLogin = (req, res) => {
	try {
		const { username, password } = req.body;
		const findUser = "SELECT * from users WHERE username = ?";

		db.query(findUser, [username], async (err, result) => {
			if (err) {
				req.flash("error_msg", "Authentication failed.");
				res.redirect("/");
			} else {
				if (result.length > 0) {
					const match_password = await bcrypt.compare(
						password,
						result[0].password
					);
					if (match_password) {
						const generateToken = createTokenUser(
							result[0].username
						);
						res.cookie("token", generateToken, { httpOnly: true });
						res.redirect("/client");
					} else {
						req.flash(
							"error_msg",
							"Incorrect username or password"
						);
						res.redirect("/");
					}
				} else {
					req.flash("error_msg", "Could'nt find your account");
					res.redirect("/");
				}
			}
		});
	} catch {
		throw err;
	}
};
const getRegister = (req, res) => {
	res.render("signup");
};
const postRegister = async (req, res) => {
	//Data from the form ../register
	const {
		username,
		firstname,
		lastname,
		phonenumber,
		gender,
		email,
		password,
	} = req.body;
	let errors = [];
	//Sql statement if there is duplciate in database
	var user_exist = "Select count(*) as `count` from users where username = ?";
	var email_exist = "Select count(*) as `count` from users where email = ?";
	var phone_exist =
		"Select count(*) as `count` from users where phonenumber = ?";
	//Query statement
	const user_count = (await queryParam(user_exist, [username]))[0].count;
	const email_count = (await queryParam(email_exist, [email]))[0].count;
	const phone_count = (await queryParam(phone_exist, [phonenumber]))[0].count;

	//Check if there is duplicate

	if (email_count > 0) {
		errors.push({ msg: "Email is already registered" });
	}
	if (phone_count > 0) {
		errors.push({ msg: "Phonenumber is already registered" });
	}
	if (user_count > 0) {
		errors.push({ msg: "Username is already registered" });
	}

	//To encrypt the password using hash
	const salt = bcrypt.genSaltSync(15);
	const hash = bcrypt.hashSync(password, salt);
	//Data to insert in sql
	var data = {
		firstname,
		lastname,
		email,
		phonenumber,
		gender,
		username,
		password: hash,
		join_date: date_time(),
	};
	//Add account to database
	var sql = "INSERT INTO users SET ?";
	db.query(sql, data, (err, rset) => {
		if (err) {
			res.render("signup", {
				errors,
			});
		} else {
			req.flash("success_msg", "You successfully created an account!");
			res.redirect("/signup");
		}
	});
};
const getClient = async (req, res) => {
	const rooms = await zeroParam(
		"SELECT * FROM rooms ORDER BY RAND() LIMIT 9"
	);

	res.render("Tenant/home", { title: "Client", rooms });
};

const getRooms = async (req, res) => {
	const page = req.query.page || 1;
	const limit = 12;
	const sortField = req.query.sortField || "room_number"; // default sort field
	const sortOrder = req.query.sortOrder || "asc"; // default sort order
	const availableOnly = req.query.availableOnly === "on" || false; // Ensure availableOnly is a boolean

	const countQuery = `SELECT COUNT(*) as count FROM rooms ${
		availableOnly ? "WHERE status = 'Available'" : ""
	}`;
	const totalPagesPromise = new Promise((resolve, reject) => {
		db.query(countQuery, (err, results) => {
			if (err) reject(err);
			const count = results[0].count;
			const totalPages = Math.ceil(count / limit);
			resolve(totalPages);
		});
	});

	totalPagesPromise
		.then((totalPages) => {
			if (page > totalPages) {
				res.render("Tenant/notfound", {
					title: "No Room Found",
					sortField,
					sortOrder,
					availableOnly,
				});
			} else {
				const offset = (page - 1) * limit;
				let selectQuery = `
                    SELECT *
                    FROM rooms
                    ${availableOnly ? "WHERE status = 'Available'" : ""}
                    ORDER BY
                        CASE '${sortField}'
                            WHEN 'room_number' THEN room_number
                            WHEN 'room_floor' THEN room_floor
                            WHEN 'type' THEN type
                            WHEN 'capacity' THEN capacity
                            WHEN 'price' THEN price
                         
                            ELSE room_number
                        END ${sortOrder}
                    LIMIT ? OFFSET ?
                `;

				const selectPromise = new Promise((resolve, reject) => {
					db.query(selectQuery, [limit, offset], (err, results) => {
						if (err) reject(err);
						resolve(results);
					});
				});

				selectPromise
					.then((rows) => {
						const currentPage = parseInt(page);
						const urlBase = `/rooms?sortField=${sortField}&sortOrder=${sortOrder}&${
							availableOnly ? "availableOnly=on&" : ""
						}`;
						const prevPageUrl =
							currentPage > 1
								? urlBase + `page=${currentPage - 1}`
								: null;
						const nextPageUrl =
							currentPage < totalPages
								? urlBase + `page=${currentPage + 1}`
								: null;
						res.render("Tenant/rooms", {
							rooms: rows,
							currentPage,
							totalPages,
							sortField,
							sortOrder,
							prevPageUrl,
							nextPageUrl,
							title: "All Rooms",
							availableOnly,
						});
					})
					.catch((err) => {
						console.error(err);
						res.sendStatus(500);
					});
			}
		})
		.catch((err) => {
			console.error(err);
			res.sendStatus(500);
		});
};

const getRoomView = async (req, res) => {
	const room_id = req.params.room_id;
	try {
		const room = (
			await queryParam("SELECT * FROM rooms WHERE id = ?", [room_id])
		)[0];

		const images = await queryParam(
			"SELECT image_url FROM images WHERE room_id = ?",
			[room_id]
		);
		res.render("Tenant/room_view", { title: "View Room", room, images });
	} catch (e) {
		console.error(e);
		res.redirect("/client");
	}
};

const postReservation = async (req, res) => {
	const user_id = (
		await queryParam("SELECT id FROM users WHERE username = ?", [
			res.locals.id,
		])
	)[0].id;

	const {
		check_in_date,
		check_out_date,
		
		room_id,
		total_price,
		payment_method,
	} = req.body;
	const reservation = {
		user_id,
		check_in_date,
		check_out_date,
		
		room_id,
		user_id,
		total_price: total_price * 6,
		payment_method,
		status: "Pending",
		date_created: date_time()
	};

	try {
		db.query(
			"SELECT * FROM reservation WHERE user_id = ? AND room_id = ? AND status = 'Pending'",
			[user_id, room_id],
			(err, rset) => {
				if (err) {
					req.flash("error_msg", "Error reservation");
					return res.redirect(`/room/${room_id}`);
				}

				if (rset.length > 0) {
					req.flash(
						"error_msg",
						"You have already reserved this room."
					);
					return res.redirect(`/room/${room_id}`);
				}
				db.query(
					"INSERT INTO reservation SET ?",
					reservation,
					(err, result) => {
						if (err) {
							req.flash("error_msg", "Error reservation");
							return res.redirect(`/room/${room_id}`);
						} else {
							req.flash(
								"success_msg",
								"You have successfully reserved this room."
							);
							res.redirect(`/room/${room_id}`);
						}
					}
				);
			}
		);
	} catch (e) {
		console.error(e);
	}
};

const getAbout = (req, res) => {
	res.render("Tenant/about", { title: "About" });
};

const postMessages = async (req, res) => {
	const user_id = (
		await queryParam("SELECT id FROM users WHERE username = ?", [
			res.locals.id,
		])
	)[0].id;

	const { subject, content } = req.body;

	const data = {
		user_id,
		subject,
		content,
		date_created: date_time()
	};
	try {
		db.query("INSERT INTO messages SET ?", data, (err, result) => {
			if (err) {
				console.log(err);
				req.flash("error_msg", "Error");
				return res.redirect("/about");
			} else {
				req.flash("success_msg", "Successfully sent a message");
				res.redirect("/about");
			}
		});
	} catch (e) {
		console.log(e);
		req.flash("error_msg", "Error inserting messages");
		return res.redirect("/about");
	}
};

const getAccount = async (req, res) => {
	const user_id = (
		await queryParam("SELECT id FROM users WHERE username = ?", [
			res.locals.id,
		])
	)[0].id;
	// Get pending reservations
	const getPending = await queryParam(
		"SELECT reservation.*, rooms.room_number FROM reservation INNER JOIN rooms ON rooms.id = reservation.room_id WHERE reservation.user_id = ? AND reservation.status IN ('Pending', 'Confirmed')",
		[user_id]
	);

	// Get recent (cancelled or confirmed) reservations
	const recentReservation = await queryParam(
		"SELECT reservation.*, rooms.room_number FROM reservation INNER JOIN rooms ON rooms.id = reservation.room_id WHERE reservation.user_id = ? AND reservation.status IN ('Cancelled', 'Completed')",
		[user_id]
	);
	const messages = await queryParam(
		"SELECT * FROM messages WHERE user_id = ? GROUP BY id DESC LIMIT 3",
		[user_id]
	);
	const profile = (
		await queryParam("SELECT * FROM users WHERE id = ?", [user_id])
	)[0];
	res.render("Tenant/account", {
		title: "Account",
		getPending,
		recentReservation,
		profile,
		messages,
	});
};

const getModifyReservation = async (req, res) => {
	const user_id = (
		await queryParam("SELECT id FROM users WHERE username = ?", [
			res.locals.id,
		])
	)[0].id;
	const id = req.params.id;
	db.query(
		"SELECT reservation.* ,rooms.room_number FROM reservation INNER JOIN rooms ON rooms.id = reservation.room_id WHERE reservation.user_id = ? AND reservation.id = ?",
		[user_id, id],
		(err, result) => {
			if (err) {
				res.render("Tenant/view_reservation", {
					title: "Edit Reservation",
				});
			} else {
				res.render("Tenant/view_reservation", {
					title: "Edit Reservation",
					reservation: result[0],
				});
			}
		}
	);
};

const postModifyReservation = (req, res) => {
	const { check_in_date, check_out_date, id, payment_method } =
		req.body;

	const reservation = {
		check_in_date,
		check_out_date,
		
		payment_method,
	};

	try {
		db.query(
			"UPDATE reservation SET ? WHERE id = ?",
			[reservation, id],
			(err, result) => {
				if (err) {
					req.flash("error_msg", "Error updating reservation");
					return res.redirect("/account");
				} else {
					req.flash(
						"success_msg",
						"You have successfully updated your reservation."
					);
					res.redirect("/account");
				}
			}
		);
	} catch (e) {
		req.flash("error_msg", "Error updating");
		res.redirect("/account");
		console.error(e);
	}
};

const cancelReservation = async (req, res) => {
	const reservation_id = req.body.data;

	try {
		const reservation = (
			await queryParam(
				"UPDATE reservation SET status = 'Cancelled' WHERE id = ?",
				[reservation_id]
			)
		)[0];

		res.status(200).json({ status: "success" });
	} catch (err) {
		console.log("Error: " + err);
		req.flash("error_msg", "Error occur");
		res.redirect("/account");
	}
};

const getRecieptPdf = async (req, res) => {
	try {
		const reservationId = req.params.id;

		// Fetch reservation details from your database or API
		const getReservationDetails = (reservationId, username) => {
			return new Promise((resolve, reject) => {
				db.query(
					"SELECT reservation.*, rooms.room_number, users.firstname, users.lastname, users.email, users.phonenumber FROM reservation INNER JOIN rooms ON rooms.id = reservation.room_id INNER JOIN users ON users.id = reservation.user_id WHERE reservation.id = ? AND users.username = ?",
					[reservationId, username],
					(err, result) => {
						if (err) {
							reject(err);
						} else {
							resolve(result[0]);
						}
					}
				);
			});
		};
		const reservation = await getReservationDetails(
			reservationId,
			res.locals.id
		);
		if (!reservation) {
			return res.status(404).send("Reservation not found");
		}

		const browser = await puppeteer.launch({
			headless: "new",
		});

		const page = await browser.newPage();

		// Customize the HTML content based on reservation details
		const htmlContent = `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Reservation Contract</title>
			<style>
				body {
					font-family: 'Arial', sans-serif;
					margin: 40px;
					background-color: #f4f4f4;
					color: #333;
				}
		
				.container {
					max-width: 600px;
					margin: 0 auto;
					background-color: #fff;
					padding: 20px;
					border-radius: 10px;
					box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
				}
		
				h1 {
					text-align: center;
					color: #3498db;
				}
		
				h2 {
					color: #3498db;
				}
		
				p {
					margin-bottom: 10px;
				}
		
				hr {
					border: 0;
					border-top: 1px solid #ccc;
					margin: 20px 0;
				}
		
				.contract-details {
					padding: 20px;
					border-radius: 10px;
					background-color: #ecf0f1;
					margin-top: 20px;
				}
		
				.footer {
					margin-top: 40px;
					text-align: center;
					color: #7f8c8d;
				}
		
				.name {
					font-weight: bold;
					margin-bottom: 5px;
				}
			</style>
		</head>
		<body>
			<div class="container">
				<h1>Reservation Contract</h1>
		
				<div class="contract-details">
					<p><strong>Reservation ID:</strong> ${reservation.id}</p>
					<p><strong>Room Number:</strong> ${reservation.room_number}</p>
					<p><strong>Check-in Date:</strong> ${reservation.check_in_date}</p>
					<p><strong>Check-out Date:</strong> ${reservation.check_out_date}</p>
					<p><strong>Total Price:</strong> ${reservation.total_price}</p>
					<p><strong>Status:</strong> ${reservation.status}</p>
					<p><strong>Payment Method:</strong> ${reservation.payment_method}</p>
					<p><strong>Payment Status:</strong> ${
						reservation.is_paid ? "PAID" : "UNPAID"
					}</p>
					<p class="name"><strong>First Name:</strong> ${reservation.firstname}</p>
					<p class="name"><strong>Last Name:</strong> ${reservation.lastname}</p>
					<p><strong>Email:</strong> ${reservation.email}</p>
					<p><strong>Phone Number:</strong> ${reservation.phonenumber}</p>
					
					<hr>
					
					<h2>Terms and Conditions</h2>
					<p>This reservation is valid for a period of 6 months, starting from the check-in date.</p>
					<p>The total price of P${
						reservation.total_price
					} includes all applicable charges and taxes.</p>
					<p>Payment is non-refundable after the check-in date.</p>
					<p>The guest agrees to follow all rules and regulations of the accommodation during the stay.</p>
					<!-- Add more terms and conditions as needed -->
				</div>
			</div>
		
			<div class="footer">
				<p>Thank you for choosing our service. We look forward to serving you!</p>
			</div>
		</body>
		</html>
		`;

		await page.setContent(htmlContent);

		const pdfOptions = {
			format: "A4",
			path: path.join(__dirname, "..", "public", "contract.pdf"),
		};

		await page.pdf(pdfOptions);

		await browser.close();

		res.contentType("application/pdf");
		res.sendFile(pdfOptions.path);
	} catch (error) {
		console.error("Error generating contract:", error);
		res.status(500).send("Error generating contract");
	}
};

const getError403 = (req, res) => {
	res.render("error403");
};
const getError404 = (req, res) => {
	res.render("error404");
};

const getLogout = (req, res) => {
	res.clearCookie("token");
	res.redirect("/");
};
module.exports = {
	getLogin,
	postLogin,
	getRegister,
	postRegister,
	getClient,
	getRooms,
	getRoomView,
	postReservation,
	getAbout,
	postMessages,
	getAccount,
	getModifyReservation,
	postModifyReservation,
	cancelReservation,
	getRecieptPdf,
	getError403,
	getError404,
	getLogout,
};
