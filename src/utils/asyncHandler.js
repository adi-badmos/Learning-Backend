// const asyncHandler = () => {};
// const asyncHandler = (func) => {() => {}}
// const asyncHandler = (func) => () => {}
// const asyncHandler = (func) => async () => {}

const asyncHandler = (requestHandler) => {
    (req, res, next) => {
        Promise.resolve(asyncHandler(req, res, next)).catch((error) => next(error));
    }
};

export { asyncHandler };

// const asyncHandler = (requestHandler) => async (req, res, next) => {
//     try {
//         await requestHandler(req, res, next);
//     } catch(error) {
//         res.status(error.code || 500).json({
//             success: false,
//             message: error.message
//         });
//     }
// }