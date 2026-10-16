/*
 * Alexandre Bénanas's colours (#123): a plain grey hoodie and dark jeans on
 * the lycéen hoodie body, a dark riot helmet with a smoky visor, and a
 * white-and-red POLICE armband. Pure, so it is tested without a scene.
 *
 * Generic on purpose: one fixed, ordinary person under the helmet, nothing
 * that looks like anyone real.
 */
import { SKIN_CELL, type CellPaint } from "../models/index.ts";

/** The lycéen hoodie body's cells (protesterLook's BODY_CELLS): the hoodie (and the eyes), the trousers, the backpack, the hair. */
const HOODIE_CELL = 8;
const TROUSERS_CELL = 9;
const BACKPACK_CELL = 0;
const HAIR_CELL = 5;

export const HOODIE_GREY = "#8c8f96";
export const JEANS = "#3b4256";

/** His body: grey hoodie, dark jeans, a dull backpack, an ordinary skin and hair. */
export const BENANAS_PAINT: CellPaint = {
  [SKIN_CELL]: "#d6a07a",
  [HOODIE_CELL]: HOODIE_GREY,
  [TROUSERS_CELL]: JEANS,
  [BACKPACK_CELL]: "#4b4d52",
  [HAIR_CELL]: "#2a1c14",
};

/** The riot helmet (`MODELS.props.riotHelmet`): cell 1 the shell, 3 the visor, 8 the hinges and ridge. */
export const HELMET_PAINT: CellPaint = {
  1: "#1d2333",
  3: "#5d7a96",
  8: "#0d0f14",
};

/** The BAC's armband model (cells 0, 7, 8), white with red: a "POLICE" band, worn by the wrong guy. */
export const ARMBAND_PAINT: CellPaint = {
  0: "#f4f4f0",
  7: "#d0262c",
  8: "#f4f4f0",
};
