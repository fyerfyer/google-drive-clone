import { body, validationResult } from "express-validator";
import { Request, Response, NextFunction } from "express";
import { AppError } from "./errorHandler";
import { StatusCodes } from "http-status-codes";

const handleValidateErrors = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors
      .array()
      .map((err) => `${err.type}: ${err.msg}`)
      .join("; ");
    return next(
      new AppError(
        StatusCodes.BAD_REQUEST,
        `Validation failed: ${formattedErrors}`
      )
    );
  }
  next();
};

export const registerValidator = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email format")
    .normalizeEmail(),

  body("password")
    .trim()
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 2, max: 20 })
    .withMessage("Password must be between 2 and 20 characters"),

  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ min: 2, max: 50 })
    .withMessage("Name must be between 2 and 50 characters"),

  body("avatarDataUrl")
    .optional()
    .isString()
    .withMessage("Avatar must be a base64 encoded string")
    .custom((value) => {
      const dataUrlPattern = /^data:image\/(png|jpe?g|webp);base64,/i;
      if (!dataUrlPattern.test(value)) {
        throw new Error("Avatar must be a valid data URL (PNG, JPG, or WEBP)");
      }

      const base64String = value.split(",")[1];
      const bufferLength = Buffer.from(base64String, "base64").length;
      if (bufferLength > 5 * 1024 * 1024) {
        throw new Error("Avatar must be smaller than 5MB");
      }

      return true;
    }),

  handleValidateErrors,
];

export const loginValidator = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email format")
    .normalizeEmail(),

  body("password").notEmpty().withMessage("Password is required"),

  handleValidateErrors,
];

export const updateValidator = [
  body("email")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Email cannot be empty when provided")
    .isEmail()
    .withMessage("Invalid email format")
    .normalizeEmail(),

  body("name")
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Name must be between 2 and 50 characters"),

  body("avatarDataUrl")
    .optional()
    .isString()
    .withMessage("Avatar must be a base64 encoded string")
    .custom((value) => {
      const dataUrlPattern = /^data:image\/(png|jpe?g|webp);base64,/i;
      if (!dataUrlPattern.test(value)) {
        throw new Error("Avatar must be a valid data URL (PNG, JPG, or WEBP)");
      }

      const base64String = value.split(",")[1];
      const bufferLength = Buffer.from(base64String, "base64").length;
      if (bufferLength > 5 * 1024 * 1024) {
        throw new Error("Avatar must be smaller than 5MB");
      }

      return true;
    }),

  body()
    .custom((_, { req }) => {
      if (
        !req.body.name &&
        !req.body.email &&
        !req.body.avatarDataUrl &&
        !req.file
      ) {
        throw new Error("Please provide at least one field to update");
      }
      return true;
    })
    .withMessage("No update payload provided"),

  handleValidateErrors,
];
