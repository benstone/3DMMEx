/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: ShonK
    Project: Kauai
    Reviewed:
    Copyright (c) Microsoft Corporation

    Endian include file.

***************************************************************************/
#ifndef ENDIAN_H
#define ENDIAN_H

// define the endian-ness
#ifdef IN_80386
#ifndef LITTLE_ENDIAN
#define LITTLE_ENDIAN
#endif // LITTLE_ENDIAN
#endif // IN_80386

#ifdef LITTLE_ENDIAN
#define BigLittle(a, b) b
#define Big(a)
#define Little(a) a
#else //! LITTLE_ENDIAN
#define BigLittle(a, b) a
#define Big(a) a
#define Little(a)
#endif //! LITTLE_ENDIAN

#endif
