import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/apiResponse.js";
import jwt from "jsonwebtoken";

const generateAccessAndRefreshToken = async(userId) => {
    try {
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });

        return { accessToken, refreshToken };
    } catch(error) {
        throw new ApiError(500, "Something went wrong while generating access and refresh token!");
    }
};

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

const loginUser = asyncHandler(async (req, res) => {
    // Step 1: Get user details from frontend
    const { username, email, password } = req.body;

    // Step 2: Check if either username or email exists
    if(!username && !email) { throw new ApiError(400, "Either username or email is required!"); }

    // Step 3: Check if user exists in database
    const user = await User.findOne({ $or: [{username}, {email}] });
    if(!user) { throw new ApiError(404, "User does not exist!"); }

    // Step 4: Check if password is correct
    const isPasswordValid = await user.isPasswordCorrect(password);
    if(!isPasswordValid) { throw new ApiError(401, "Invalid user credentials!"); }

    // Step 5: Generate Access Token and Refresh Token
    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(user._id);
    
    // Step 6: Send cookies
    const loggedInUser = await User.findById(user._id).select("-password -refreshToken");

    // this won't allow the cookie to be modified by frontend, it can only be changed by server
    const options = {
        httpOnly: true,
        secure: true
    }

    // Step 7: Return response
    return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(new ApiResponse(
        200,
        {
            user: loggedInUser, accessToken, refreshToken
        },
        "User logged in successfully!"
    ));
});

const logoutUser = asyncHandler(async (req, res) => {
    // Step 1: Clear refresh token
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: { refreshToken: undefined }
        },
        { new: true }
    )

    // Step 2: Clear cookies and send response
    const options = {
        httpOnly: true,
        secure: true
    }

    return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out!"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;
    if(!incomingRefreshToken) { throw new ApiError(401, "Unauthorised request!"); }

    try {
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET);
    
        const user = await User.findById(decodedToken?._id);
        if(!user) { throw new ApiError(401, "Invalid refresh token!"); }
    
        if(incomingRefreshToken !== user?.refreshToken) { throw new ApiError(401, "Refresh token is expired or used!"); }
    
        const options = {
            httpOnly: true,
            secure: true
        };
        
        const { accessToken, newRefreshToken } = await generateAccessAndRefreshToken(user._id);
    
        return res
        .status(200)
        .cookie("accesToken", accessToken, options)
        .cookie("refreshToken", newRefreshToken, options)
        .json(new ApiResponse(
            200,
            { accessToken, newRefreshToken },
            "Access token refreshed!"
        ));
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token!");
    }
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body;

    // Since, the user is changing the password => the user must be logged in => req.user = user (auth.middleware.js)
    // Using this we can get the user
    const user = await User.findById(req.user?._id);
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

    if(!isPasswordCorrect) { throw new ApiError(400, "Invalid password!"); }

    user.password = newPassword;
    await user.save({ validateBeforeSave: false });

    return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully!"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
    return res
    .status(200)
    .json(200, req.curr, "Current user fetched successfully!");
});

const updateAccountDetails = asyncHandler(async (req, res) => {
    const { fullName, email } = req.body;
    if(!fullName || !email) { throw new ApiError(400, "All fields are required!"); }

    const user = User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: { fullName, email }
        },
        { new: true }
    ).select("-password");

    return res
    .status(200)
    .json(200, user, "Account details updated successfully!");
});

const updateUserAvatar = asyncHandler(async (req, res) => {
    const avatarLocalPath = req.file?.path;
    if(!avatarLocalPath) { throw new ApiError(400, "Avatar file is missing!"); }

    const avatar = await uploadOnCloudinary(avatarLocalPath);
    if(!avatar.url) { throw new ApiError(400, "Error while uploading avatar on cloudinary!"); }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                avatar: avatar.url
            }
        },
        { new: true }
    ).select("-password");

    return res
    .status(200)
    .json(200, user, "Avatar updated successfully!");
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
    const coverImageLocalPath = req.file?.path;
    if(!coverImageLocalPath) { throw new ApiError(400, "Cover image file is missing!"); }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath);
    if(!coverImage.url) { throw new ApiError(400, "Error while uploading cover image on cloudinary!"); }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                coverImage: coverImage.url
            }
        },
        { new: true }
    ).select("-password");

    return res
    .status(200)
    .json(200, user, "Cover image updated successfully!");
});

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage
};