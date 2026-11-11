const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config();

const userSchema = new mongoose.Schema({}, { strict: false });
const User = mongoose.model("User", userSchema);

const migrate = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    // Add new fields to all users
    const result = await User.updateMany(
      {},
      {
        $set: {
          bio: "",
          position: "",
          location: "",
          website: "",
          socialLinks: {
            linkedin: "",
            github: "",
            twitter: "",
            facebook: "",
            instagram: "",
          },
          address: {
            street: "",
            city: "",
            state: "",
            country: "",
            zipCode: "",
          },
          emergencyContact: {
            name: "",
            relationship: "",
            phone: "",
            email: "",
          },
          skills: [],
          languages: [],
          achievements: [],
          notificationPreferences: {
            email: true,
            push: true,
            desktop: false,
            taskReminder: true,
            deadlineAlert: true,
            teamUpdate: true,
          },
        },
      },
    );

    console.log(`✅ Updated ${result.modifiedCount} users`);
    process.exit(0);
  } catch (error) {
    console.error("Migration error:", error);
    process.exit(1);
  }
};

migrate();
