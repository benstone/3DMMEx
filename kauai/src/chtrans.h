/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/**********************************************************************
    Author: ShonK
    Project: Kauai
    Reviewed:
    Copyright (c) Microsoft Corporation

    Character translation table for Mac to and from Win

**********************************************************************/
#ifndef SYMC
// disable brain dead cast warnings
#pragma warning(disable : 4305)
#pragma warning(disable : 4309)
#pragma warning(disable : 4838)
#endif //! SYMC

static constexpr unsigned char _mpchschsMacToWin[128] = {
    /*        0/8   1/9   2/A   3/B   4/C   5/D   6/E   7/F */
    /* 80 */ 0xC4, 0xC5, 0xC7, 0xC9, 0xD1, 0xD6, 0xDC, 0xE1, 0xE0, 0xE2, 0xE4, 0xE3, 0xE5, 0xE7, 0xE9, 0xE8,
    /* 90 */ 0xEA, 0xEB, 0xED, 0xEC, 0xEE, 0xEF, 0xF1, 0xF3, 0xF2, 0xF4, 0xF6, 0xF5, 0xFA, 0xF9, 0xFB, 0xFC,
    /* A0 */ 0x86, 0xB0, 0xA2, 0xA3, 0xA7, 0x95, 0xB6, 0xDF, 0xAE, 0xA9, 0x99, 0xB4, 0xA8, 0x7F, 0xC6, 0xD8,
    /* B0 */ 0x7F, 0xB1, 0x7F, 0x7F, 0xA5, 0xB5, 0x7F, 0x7F, 0x7F, 0x7F, 0x7F, 0xAA, 0xBA, 0x7F, 0xE6, 0xF8,
    /* C0 */ 0xBF, 0xA1, 0xAC, 0x7F, 0x83, 0x7F, 0x7F, 0xAB, 0xBB, 0x85, 0xA0, 0xC0, 0xC3, 0xD5, 0x8C, 0x9C,
    /* D0 */ 0x96, 0x97, 0x93, 0x94, 0x91, 0x92, 0xF7, 0x7F, 0xFF, 0x9F, 0x2F, 0xA4, 0x8B, 0x9B, 0x7F, 0x7F,
    /* E0 */ 0x87, 0xB7, 0x82, 0x84, 0x89, 0xC2, 0xCA, 0xC1, 0xCB, 0xC8, 0xCD, 0xCE, 0xCF, 0xCC, 0xD3, 0xD4,
    /* F0 */ 0x7F, 0xD2, 0xDA, 0xDB, 0xD9, 0xA6, 0x88, 0x98, 0xAF, 0x7F, 0x7F, 0xB0, 0xB8, 0xA8, 0x7F, 0x7F,
};

static constexpr unsigned char _mpchschsWinToMac[128] = {
    /*        0/8   1/9   2/A   3/B   4/C   5/D   6/E   7/F */
    /* 80 */ 0x7F, 0x7F, 0xE2, 0xC4, 0xE3, 0xC9, 0xA0, 0xE0, 0xF6, 0xE4, 0x7F, 0xDC, 0xCE, 0x7F, 0x7F, 0x7F,
    /* 90 */ 0x7F, 0xD4, 0xD5, 0xD2, 0xD3, 0xA5, 0xD0, 0xD1, 0xF7, 0xAA, 0x7F, 0xDD, 0xCF, 0x7F, 0x7F, 0xD9,
    /* A0 */ 0xCA, 0xC1, 0xA2, 0xA3, 0xDB, 0xB4, 0xF5, 0xA4, 0xAC, 0xA9, 0xBB, 0xC7, 0xC2, 0xD0, 0xA8, 0xF8,
    /* B0 */ 0xA1, 0xB1, 0x32, 0x33, 0xAB, 0xB5, 0xA6, 0xE1, 0xE2, 0x31, 0xBC, 0xC8, 0x7F, 0x7F, 0x7F, 0xC0,
    /* C0 */ 0xCB, 0xE7, 0xE5, 0xCC, 0x80, 0x81, 0xAE, 0x82, 0xE9, 0x83, 0xE6, 0xE8, 0xED, 0xEA, 0xEB, 0xEC,
    /* D0 */ 0x7F, 0x84, 0xF1, 0xEE, 0xEF, 0xCD, 0x85, 0x7F, 0xAF, 0xF4, 0xF2, 0xF3, 0x86, 0x59, 0x7F, 0xA7,
    /* E0 */ 0x88, 0x87, 0x89, 0x8B, 0x8A, 0x8C, 0xBE, 0x8D, 0x8F, 0x8E, 0x90, 0x91, 0x93, 0x92, 0x94, 0x95,
    /* F0 */ 0x7F, 0x96, 0x98, 0x97, 0x99, 0x9B, 0x9A, 0xD6, 0xBF, 0x9D, 0x9C, 0x9E, 0x9F, 0x79, 0x7F, 0xD8,
};

schar _mpchschsUpper[256];
schar _mpchschsLower[256];

#ifndef SYMC
#pragma warning(default : 4305)
#pragma warning(default : 4309)
#pragma warning(default : 4838)
#endif //! SYMC
