const bcrypt = require("bcrypt");
const { createTokenAdmin } = require("../utils/token");
const { date_time } = require("../utils/date");
const puppeteer = require("puppeteer");
const fs = require("fs");

const db = require("../database/db");
const { time } = require("console");
const { json } = require("express");

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
	res.render("Admin/login");
};
const postLogin = (req, res) => {
	try {
		const { username, password } = req.body;
		const findUser = "SELECT * from admin WHERE username = ?";

		db.query(findUser, [username], async (err, result) => {
			if (err) {
				req.flash("error_msg", "Authentication failed.");
				res.redirect("/admin/login");
			} else {
				if (result.length > 0) {
					const match_password = await bcrypt.compare(
						password,
						result[0].password
					);
					if (match_password) {
						const generateToken = createTokenAdmin(
							result[0].username
						);
						res.cookie("token", generateToken, { httpOnly: true });
						res.redirect("/admin/dashboard");
					} else {
						req.flash(
							"error_msg",
							"Incorrect username or password"
						);
						res.redirect("/admin/login");
					}
				} else {
					req.flash("error_msg", "Could'nt find your account");
					res.redirect("/admin/login");
				}
			}
		});
	} catch {
		throw err;
	}
};

const getDashboard = async (req, res) => {
	const total_user = (
		await zeroParam("SELECT count(*) as 'count' FROM users")
	)[0].count;
	
	const total_reservation = (
		await zeroParam("SELECT COUNT(*) as 'count' FROM reservation")
	)[0].count;
	const total_pending = (
		await zeroParam(
			"SELECT COUNT(*) as 'count' FROM reservation WHERE status = 'Pending'"
		)
	)[0].count;
	const total_confirmed = (
		await zeroParam(
			"SELECT COUNT(*) as 'count' FROM reservation WHERE status = 'Confirmed'"
		)
	)[0].count;
	const total_completed = (
		await zeroParam(
			"SELECT COUNT(*) as 'count' FROM reservation WHERE status = 'Completed'"
		)
	)[0].count;
	const total_cancelled = (
		await zeroParam(
			"SELECT COUNT(*) as 'count' FROM reservation WHERE status = 'Cancelled'"
		)
	)[0].count;
	const total_rooms = (
		await zeroParam("SELECT COUNT(*) as 'count' FROM rooms")
	)[0].count;
	const total_available = (
		await zeroParam(
			"SELECT COUNT(*) AS 'count' FROM rooms WHERE status = 'Available'"
		)
	)[0].count;
	const total_occupied = (
		await zeroParam(
			"SELECT COUNT(*) AS 'count' FROM rooms WHERE status = 'Occupied'"
		)
	)[0].count;

	const total_revenue = (
		await zeroParam(
			"SELECT SUM(total_price) AS total_revenue FROM reservation WHERE is_paid = '1'"
		)
	)[0].total_revenue;

	const total_price = (
		await zeroParam(
			"SELECT SUM(total_price) AS total_price FROM reservation WHERE is_paid = '0' AND status = 'Pending'"
		)
	)[0].total_price;

	const financial_summary = await zeroParam(
		"SELECT MONTH(date_created) AS month, SUM(total_price) AS total_revenue FROM reservation WHERE status IN ('Confirmed','Completed') AND YEAR(date_created) = YEAR(CURRENT_DATE) AND is_paid = '1' GROUP BY MONTH(date_created) ORDER BY month"
	);

	const reservations = await zeroParam(
		"SELECT reservation.*, users.username, rooms.room_number FROM reservation JOIN users ON reservation.user_id = users.id JOIN rooms ON reservation.room_id = rooms.id ORDER BY reservation.id DESC LIMIT 5;"
	);

	const users = await zeroParam(
		"SELECT * FROM users ORDER BY id DESC LIMIT 5"
	);

	res.render("Admin/dashboard", {
		total_user,
		total_reservation,
		total_pending,
		total_confirmed,
		total_completed,
		total_cancelled,
		total_rooms,
		total_available,
		total_occupied,
		total_revenue: total_revenue || 0,
		total_price: total_price || 0,
		financial_summary: JSON.stringify(financial_summary),
		reservations,
		users,
	});
};

const getRooms = async (req, res) => {
	const rooms = await queryParam(
		"SELECT * FROM rooms ORDER BY rooms.id DESC"
	);
	res.render("Admin/rooms", { rooms });
};

const getRoomEdit = async (req, res) => {
	try {
		const room_id = req.params.id;
		const room = (
			await queryParam("SELECT * FROM rooms WHERE id = ?", [room_id])
		)[0];
		const images = await queryParam(
			"SELECT * FROM images WHERE room_id = ?",
			[room_id]
		);

		res.render("Admin/edit_room", { room, images });
	} catch (e) {
		console.error(e);
		res.redirect("/admin/dashboard");
	}
};

const getRoomAdd = (req, res) => {
	res.render("Admin/add_room");
};

const postRoomAdd = (req, res) => {
	const { room_number, room_floor, type, capacity, price, description } =
		req.body;
	const reservation = {
		room_number,
		room_floor,
		type,
		capacity,
		price,
		description,
		status: "Not Available",
		cover_url: "placeholder.png",
	};

	try {
		// Check if room_number already exists
		db.query(
			"SELECT * FROM rooms WHERE room_number = ?",
			[room_number],
			(selectErr, selectResult) => {
			
				if (selectErr) {
					req.flash("error_msg", "Error checking room existence");
					return res.redirect(`/admin/rooms/`);
				}

				if (selectResult.length > 0) {
					// Room number already exists
					req.flash("error_msg", "Room number already exists");
					return res.redirect(`/admin/room/add/`);
				}

				// Room number doesn't exist, proceed with insertion
				db.query(
					"INSERT INTO rooms SET ?",
					reservation,
					(insertErr, insertResult) => {
						if (insertErr) {
							req.flash("error_msg", "Error inserting room");
							return res.redirect(`/admin/rooms/`);
						} else {
							req.flash(
								"success_msg",
								"You have successfully added a room."
							);
							res.redirect(`/admin/rooms`);
						}
					}
				);
			}
		);
	} catch (e) {
		console.error(e);
		req.flash("error_msg", "Internal Server Error");
		res.redirect(`/admin/rooms`);
	}
};

const getDeleteRoom = (req, res) => {
	const id = req.body.data;

	db.query(
		"SELECT images.image_url, rooms.cover_url FROM images INNER JOIN rooms ON rooms.id = images.room_id WHERE room_id = ?",
		[id],
		(err, results) => {
			if (err) {
				console.log(err);
				return res.status(500).json({ status: "error" });
			}

			const imagePaths = results.map((result) => result.image_url);
			const thumbnailPath = results.map((result) => result.cover_url);

			imagePaths.forEach((imagePath) => {
				fs.unlink(`public/img/rooms/${imagePath}`, (err) => {
					if (err && err.code !== "ENOENT") {
						console.log(err);
						return res.status(500).json({ status: "error" });
					}
				});
			});

			fs.unlink(`public/img/thumbnail/${thumbnailPath[0]}`, (err) => {
				if (err && err.code !== "ENOENT") {
					console.log(err);
					return res.status(500).json({ status: "error" });
				}
			});

			db.query(
				"DELETE FROM images WHERE room_id = ?",
				[id],
				(err, result) => {
					if (err) {
						console.log(err);
						return res.status(500).json({ status: "error" });
					}

					db.query(
						"DELETE FROM reservation WHERE room_id = ?",
						[id],
						(err, result) => {
							if (err) {
								console.log(err);
								return res
									.status(500)
									.json({ status: "error" });
							}

							db.query(
								"DELETE FROM rooms WHERE id = ?",
								[id],
								(err, result) => {
									if (err) {
										console.log(err);
										return res
											.status(500)
											.json({ status: "error" });
									}

									if (result.affectedRows === 0) {
										return res
											.status(500)
											.json({ status: "error" });
									} else {
										return res
											.status(200)
											.json({ status: "success" });
									}
								}
							);
						}
					);
				}
			);
		}
	);
};

const postRoomUpdate = (req, res) => {
	const {
		room_number,
		room_floor,
		type,
		capacity,
		price,
		description,
		status,
		id,
	} = req.body;

	const rooms = {
		room_number,
		room_floor,
		type,
		capacity,
		price,
		description,
		status,
	};

	try {
		db.query(
			"UPDATE rooms SET ? WHERE id = ?",
			[rooms, id],
			(err, result) => {
				if (err) {
					console.log(err);
					req.flash("error_msg", "Error updating rooms");
					return res.redirect("/admin/rooms");
				} else {
					req.flash(
						"success_msg",
						"You have successfully updated rooms."
					);
					res.redirect("/admin/rooms");
				}
			}
		);
	} catch (e) {
		req.flash("error_msg", "Error updating");
		res.redirect("/admin/rooms");
		console.error(e);
	}
};

const postRoomUpdateImg = (req, res) => {
	try {
		const id = req.body.id;

		if (req.files && req.files.thumbnail) {
			// Get the path to the uploaded thumbnail image
			const thumbnail = req.files["thumbnail"][0].filename;

			// Update the thumbnail path in the restaurants table
			db.query(
				"UPDATE rooms SET cover_url = ? WHERE id = ?",
				[thumbnail, id],
				(err, result) => {
					if (err) {
						req.flash("error_msg", "Failed to upload images");
						res.redirect(`/admin/rooms/`);
					}
				}
			);
		}

		if (req.files && req.files.images) {
			// Get the paths to the uploaded images
			const images = req.files["images"].map((file) => file.filename);

			// Insert the image data into the images table
			for (const image of images) {
				db.query(
					"INSERT INTO images (room_id, image_url) VALUES (?, ?)",
					[id, image],
					(err) => {
						if (err) {
							console.log(err);
							req.flash("error_msg", "Failed to upload images");
							res.redirect(`/admin/rooms/`);
						}
					}
				);
			}
		}

		req.flash("success_msg", "Successfully edited shops");
		res.redirect(`/admin/rooms`);
	} catch (err) {
		console.log(err);
		res.status(500).send({ error: "An error occurred." });
	}
};

const getDeleteImage = (req, res) => {
	const imageId = req.body.data;
	
	// Get the image record from the database
	db.query("SELECT * FROM images WHERE id = ?", [imageId], (err, result) => {
	
		if (err) {
			console.log(err);
			return res.status(500).json({ status: "error" });
		}

		if (result.length === 0) {
			// If the image record does not exist, redirect back to the edit shop page
			return res.status(500).json({ status: "error" });
		}

		const image = result[0];

		// Delete the image record from the database
		db.query(
			"DELETE FROM images WHERE id = ?",
			[imageId],
			(err, result) => {
				if (err) {
					console.log(err);
					return res.status(500).json({ status: "error" });
				}

				// Delete the image file from the folder
				fs.unlink(`public/img/rooms/${image.image_url}`, (err) => {
					if (err) {
						console.log(err);
						return res.status(500).json({ status: "error" });
					}

					return res.status(200).json({ status: "success" });
				});
			}
		);
	});
};
const getReservation = async (req, res) => {
	const reservations = await queryParam(
		"SELECT reservation.* ,users.firstname,users.lastname,users.email, rooms.room_number FROM reservation INNER JOIN users ON users.id = reservation.user_id INNER JOIN rooms ON rooms.id = reservation.room_id;"
	);
	res.render("Admin/reservations", { reservations });
};

const getReservationEdit = async (req, res) => {
	try {
		const reservation_id = req.params.id;
		const reservation = (
			await queryParam("SELECT * FROM reservation WHERE id = ?", [
				reservation_id,
			])
		)[0];

		const rooms = await queryParam(
			"SELECT * FROM rooms WHERE id = (SELECT room_id FROM reservation WHERE id = ?)",
			[reservation_id]
		);

		res.render("Admin/edit_reservation", { reservation, rooms });
	} catch (e) {
		console.error(e);
		res.redirect("/admin/dashboard");
	}
};

const postReservationUpdate = (req, res) => {
    const {
        payment_method,
        status,
        check_in_date,
        check_out_date,
        id,
        is_paid,
        ref_num,
        room_id,
    
    } = req.body;

    let originalCapacity = 0;

    const reservation = {
        payment_method,
        id,
        check_in_date,
        check_out_date,
        status,
        is_paid,
        ref_num,
        date_updated: date_time(),
    };

    // Retrieve the original capacity
    db.query(
        "SELECT capacity FROM rooms WHERE id = ?",
        [room_id],
        (err, capacityResult) => {
			
            if (err) {
                console.log(err);
                req.flash("error_msg", "Error retrieving room capacity");
                return res.redirect("/admin/reservations");
            } else {
                originalCapacity = capacityResult[0].capacity;

                // Update reservation
                db.query(
                    "UPDATE reservation SET ? WHERE id = ?",
                    [reservation, id],
                    (err, result) => {
                        if (err) {
                            console.log(err);
                            req.flash(
                                "error_msg",
                                "Error updating reservation"
                            );
                            return res.redirect("/admin/reservations");
                        } else {
                            // Reservation update successful, now update room status and capacity
                            if (status === "Confirmed") {
                                // Decrease the room capacity
                                const updatedCapacity = Number(originalCapacity) - 1;

                                const newStatus =
                                    updatedCapacity === 0 ? "Occupied" : "Available";

                                db.query(
                                    "UPDATE rooms SET status = ?, capacity = ? WHERE id = ?",
                                    [newStatus, updatedCapacity, room_id],
                                    (err, roomUpdateResult) => {
                                        if (err) {
                                            console.log(err);
                                            req.flash(
                                                "error_msg",
                                                "Error updating room status and capacity"
                                            );
                                            return res.redirect(
                                                "/admin/reservations"
                                            );
                                        } else {
                                            req.flash(
                                                "success_msg",
                                                "Reservation confirmed. Room status updated. Capacity decreased."
                                            );
                                            return res.redirect(
                                                "/admin/reservations"
                                            );
                                        }
                                    }
                                );
                            } else if (status === "Completed") {
                                // Increase the room capacity
                                const updatedCapacity = Number(originalCapacity) + 1;

                                db.query(
                                    "UPDATE rooms SET status = 'Available', capacity = ? WHERE id = ?",
                                    [updatedCapacity, room_id],
                                    (err, roomUpdateResult) => {
                                        if (err) {
                                            console.log(err);
                                            req.flash(
                                                "error_msg",
                                                "Error updating room status and capacity"
                                            );
                                            return res.redirect(
                                                "/admin/reservations"
                                            );
                                        } else {
                                            req.flash(
                                                "success_msg",
                                                "Reservation completed. Room status updated to Available. Capacity increased."
                                            );
                                            return res.redirect(
                                                "/admin/reservations"
                                            );
                                        }
                                    }
                                );
                            } else {
                                // For other reservation statuses, redirect with success message
                                req.flash(
                                    "success_msg",
                                    "Reservation updated successfully."
                                );
                                return res.redirect("/admin/reservations");
                            }
                        }
                    }
                );
            }
        }
    );
};


const getDeleteReservation = (req, res) => {
	const id = req.body.data;
	db.query("DELETE FROM reservation WHERE id = ?", [id], (err, results) => {
		if (err) {
			return res.status(500).json({ status: "error" });
		} else {
			console.log(err);
			return res.status(500).json({ status: "success" });
		}
	});
};

const getClient = async (req, res) => {
	const clients = await queryParam(
		"SELECT * FROM users ORDER BY users.id DESC"
	);
	res.render("Admin/clients", { clients });
};

const getClientEdit = async (req, res) => {
	try {
		const username = req.params.username;
		const clients = (
			await queryParam("SELECT * FROM users WHERE username = ?", [
				username,
			])
		)[0];

		res.render("Admin/edit_client", { clients });
	} catch (e) {
		console.error(e);
		res.redirect("/admin/dashboard");
	}
};

const postClientUpdate = (req, res) => {
	const {
		id,
		firstname,
		lastname,
		gender,
		email,
		phonenumber,
		username,
		username_id,
		new_password,
	} = req.body;

	const client = {
		id,
		firstname,
		lastname,
		gender,
		email,
		phonenumber,
		username,
	};

	try {
		// Check if a different client with the same phone number, email, or username already exists
		db.query(
			"SELECT * FROM users WHERE (phonenumber = ? OR email = ? OR username = ?) AND id <> ?",
			[phonenumber, email, username, id],
			(err, duplicateCheckResults) => {
				if (err) {
					console.error(err);
					req.flash("error_msg", "Error updating client");
					return res.redirect("/admin/clients");
				}

				// Check for duplicates
				if (duplicateCheckResults.length > 0) {
					req.flash(
						"error_msg",
						"Phone number, email, or username already exists"
					);
					return res.redirect(`/admin/client/edit=${username_id}`);
				}

				// Hash the new password if it's not empty
				let hashedPassword = null;
				if (new_password.length > 0) {
					const saltRounds = 10;
					client.password = bcrypt.hashSync(new_password, saltRounds);
				}

				// Update the client data
				db.query(
					"UPDATE users SET ? WHERE id = ?",
					[client, id],
					(updateErr, updateResults) => {
						if (updateErr) {
							console.error(updateErr);
							req.flash("error_msg", "Error updating client");
							return res.redirect("/admin/clients");
						}

						req.flash("success_msg", "Client successfully updated");
						res.redirect("/admin/clients");
					}
				);
			}
		);
	} catch (e) {
		console.error(e);
		req.flash("error_msg", "Error updating client");
		res.redirect("/admin/clients");
	}
};

const getDeleteClient = (req, res) => {
	const id = req.body.data;

	// Assuming 'id' is the ID of the user whose messages you want to delete
	db.query("DELETE FROM messages WHERE user_id = ?", [id], (err, rset) => {
		if (err) {
			console.error(err);
			return res.status(500).json({ status: "error" });
		} else {
			// Messages deletion successful, now delete the user
			db.query("DELETE FROM users WHERE id = ?", [id], (err, results) => {
				if (err) {
					console.error(err);
					return res.status(500).json({ status: "error" });
				} else {
					// Both messages and user deleted successfully
					return res.status(200).json({ status: "success" });
				}
			});
		}
	});
};
const getMessages = async (req, res) => {
	const messages = await zeroParam(
		"SELECT messages.*, users.username FROM messages INNER JOIN users ON users.id = messages.user_id ORDER BY id DESC"
	);
	res.render("Admin/messages", { messages });
};

const postMessages = async (req, res) => {
	try {
		const { id, text } = req.body;
		const adminSubject = "ADMIN"; // Replace with the actual subject for admin messages

		// Fetch the original message
		const [parentMessage] = await queryParam(
			"SELECT * FROM messages WHERE id = ? AND subject != 'ADMIN' AND is_replied = 0",
			[id]
		);

		if (parentMessage.length === 0) {
			return res.status(404).json({
				status: "error",
				message: "Original message not found or already replied",
			});
		}

		// Update the original message's is_replied to true
		await queryParam("UPDATE messages SET is_replied = true WHERE id = ?", [
			parentMessage.id,
		]);

		// Insert the new reply message
		const newReply = {
			user_id: parentMessage.user_id, // Replace with actual user ID
			subject: adminSubject,
			content: text,
			date_created: date_time()
			
		};

		await queryParam("INSERT INTO messages SET ?", newReply);

		return res.status(200).json({ status: "success" });
	} catch (error) {
		console.error(error);
		res.status(500).json({
			status: "error",
			message: "Internal Server Error",
		});
	}
};
const getLogout = (req, res) => {
	res.clearCookie("token");
	res.redirect("/admin/login");
};
module.exports = {
	getLogin,
	postLogin,
	getDashboard,
	getRooms,
	getRoomEdit,
	getRoomAdd,
	postRoomAdd,
	postRoomUpdate,
	postRoomUpdateImg,
	getDeleteImage,
	getDeleteRoom,
	getReservation,
	getReservationEdit,
	postReservationUpdate,
	getDeleteReservation,
	getClient,
	getClientEdit,
	postClientUpdate,
	getDeleteClient,
	getMessages,
	postMessages,
	getLogout,
};
