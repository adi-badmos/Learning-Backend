import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/apiResponse.js";

const registerUser = asyncHandler(async (req, res) => {
    // Step 1: Get user details from frontend
    const { username, email, fullName, password } = req.body;
    console.log("req.body: ", req.body);

    // Step 2: Validation
    if([username, email, fullName, password].some((field) => field?.trim() === "")) {
        throw new ApiError(400, "All fields are required");
    }

    // Step 3: Check if user already exists: username or email
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if(existingUser) { throw new ApiError(409, "User with email or username already exists"); }

    // Step 4: Check for images and avatar
    console.log("req.files: ", req.files);
    const avatarLocalPath = req.files?.avatar[0]?.path;

    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0].path;
    }

    if(!avatarLocalPath) { throw new ApiError(400, "Avatar file is required!"); }

    // Step 5: Upload them to cloudinary using utility
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if(!avatar) { throw new ApiError(400, "Avatar file is required!"); }

    // Step 6: Create user object in database
    const user = await User.create({
        username: username.toLowerCase(),
        email,
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        password
    });

    // Step 7: Remove password and refresh token field from response
    const createdUser = await User.findById(user._id).select("-password -refreshToken");
    
    // Step 8: Check for user creation
    if(!createdUser) { throw new ApiError(500, "Something went wrong while registering the user"); }
    console.log("Registered User: ", createdUser);
    // Step 9: Return response
    return res.status(201).json(new ApiResponse(200, createdUser, "User registered successfully"));
});

export { registerUser };