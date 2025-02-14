/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: ShonK
    Project: Kauai
    Reviewed:
    Copyright (c) Microsoft Corporation

    Data movement routines.
    WARNING: Must be in a fixed (pre-loaded) seg on Mac.

***************************************************************************/
#include "util.h"
ASSERTNAME

/***************************************************************************
    Fill a block with a specific byte value.
***************************************************************************/
void FillPb(void *pv, long cb, byte b)
{
    AssertIn(cb, 0, kcbMax);
    AssertPvCb(pv, cb);

    memset(pv, b, cb);
}

/***************************************************************************
    Clear a block.
***************************************************************************/
void ClearPb(void *pv, long cb)
{
    AssertIn(cb, 0, kcbMax);
    AssertPvCb(pv, cb);

    memset(pv, 0, cb);
}

/***************************************************************************
    Reverse a block. Useful for exchanging two blocks or avoiding
    recursion.
***************************************************************************/
void ReversePb(void *pv, long cb)
{
    AssertIn(cb, 0, kcbMax);
    AssertPvCb(pv, cb);

#ifdef IN_80386

    __asm {

        // esi - high end of block
        // edi - low end of block
        // ecx - number of bytes to swap

		mov		edi,pv
		mov		esi,edi
		add		esi,cb
		mov		ecx,cb
		shr		ecx,1

		or		ecx,ecx
		jz		LDone

LLoop:
		dec		esi
		mov		al,[edi]
		mov		bl,[esi]
		mov		[edi],bl
		mov		[esi],al

		inc		edi
		dec		ecx
		jnz		LLoop
LDone:
    }

#else //! IN_80386

    byte *pb1, *pb2;
    byte b;

    for (pb2 = (pb1 = (byte *)pv) + cb - 1; pb1 < pb2;)
    {
        b = *pb1;
        *pb1++ = *pb2;
        *pb2-- = b;
    }

#endif //! IN_80386
}

/***************************************************************************
    Reverse a list of shorts.
***************************************************************************/
void ReverseRgsw(void *pv, long csw)
{
    AssertIn(csw, 0, kcbMax);
    AssertPvCb(pv, csw * SIZEOF(short));

#ifdef IN_80386

    __asm {
        // esi - high end of block
        // edi - low end of block
        // ecx - number of shorts to swap

		mov		edi,pv
		mov		esi,edi
		mov		ecx,csw
		shl		ecx,1
		add		esi,ecx
		shr		ecx,2

		or		ecx,ecx
		jz		LDone

LLoop:
		sub		esi,2
		mov		ax,[edi]
		mov		bx,[esi]
		mov		[edi],bx
		mov		[esi],ax

		add		edi,2
		dec		ecx
		jnz		LLoop
LDone:
    }

#else //! IN_80386

    long *psw1, *psw2;
    long sw;

    for (psw2 = (psw1 = reinterpret_cast<long *>(pv)) + csw - 1; psw1 < psw2;)
    {
        sw = *psw1;
        *psw1++ = *psw2;
        *psw2-- = sw;
    }

#endif //! IN_80386
}

/***************************************************************************
    Reverse a list of longs.
***************************************************************************/
void ReverseRglw(void *pv, long clw)
{
    AssertIn(clw, 0, kcbMax);
    AssertPvCb(pv, clw * SIZEOF(long));

#ifdef IN_80386

    __asm {
        // esi - high end of block
        // edi - low end of block
        // ecx - number of longs to swap

		mov		edi,pv
		mov		esi,edi
		mov		ecx,clw
		shl		ecx,2
		add		esi,ecx
		shr		ecx,3

		or		ecx,ecx
		jz		LDone

LLoop:
		sub		esi,4
		mov		eax,[edi]
		mov		ebx,[esi]
		mov		[edi],ebx
		mov		[esi],eax

		add		edi,4
		dec		ecx
		jnz		LLoop
LDone:
    }

#else //! IN_80386

    long *plw1, *plw2;
    long lw;

    for (plw2 = (plw1 = (long *)pv) + clw - 1; plw1 < plw2;)
    {
        lw = *plw1;
        *plw1++ = *plw2;
        *plw2-- = lw;
    }

#endif //! IN_80386
}

/***************************************************************************
    Swap two adjacent blocks of size cb1 and cb2 respectively.
***************************************************************************/
void SwapBlocks(void *pv, long cb1, long cb2)
{
    AssertIn(cb1, 0, kcbMax);
    AssertIn(cb2, 0, kcbMax);
    AssertPvCb(pv, cb1 + cb2);

    ReversePb(pv, cb1);
    ReversePb(PvAddBv(pv, cb1), cb2);
    ReversePb(pv, cb1 + cb2);
}

/***************************************************************************
    Swap the contents of two blocks of the same size.
***************************************************************************/
void SwapPb(void *pv1, void *pv2, long cb)
{
    AssertPvCb(pv1, cb);
    AssertPvCb(pv2, cb);
    AssertIn(cb, 0, kcbMax);

#ifdef IN_80386

    __asm {
        // edi -> memory to swap, first pointer
        // esi -> memory to swap, second pointer

		mov		edi,pv1
		mov		esi,pv2

		mov		ecx,cb
		shr		ecx,2
		jz		LBytes

LLongLoop:
		mov		eax,[edi]
		mov		ebx,[esi]
		mov		[edi],ebx
		mov		[esi],eax

		add		edi,4
		add		esi,4
		dec		ecx
		jnz		LLongLoop;

LBytes:
		mov		ecx,cb
		and		ecx,3
		jz		LDone

LByteLoop:
		mov		al,[edi]
		mov		bl,[esi]
		mov		[edi],bl
		mov		[esi],al
		inc		edi
		inc		esi
		dec		ecx
		jnz		LByteLoop

LDone:
    }

#else //! IN_80386

    byte *pb1 = (byte *)pv1;
    byte *pb2 = (byte *)pv2;
    byte b;

    Assert(pb1 + cb <= pb2 || pb2 + cb <= pb1, "blocks overlap");
    while (cb-- > 0)
    {
        b = *pb1;
        *pb1++ = *pb2;
        *pb2++ = b;
    }

#endif //! IN_80386
}

/***************************************************************************
    Move the entry at ivSrc to be immediately before the element that is
    currently at ivTarget. If ivTarget > ivSrc, the entry actually ends
    up at (ivTarget - 1) and the entry at ivTarget doesn't move. If
    ivTarget < ivSrc, the entry ends up at ivTarget and the entry at
    ivTarget moves to (ivTarget + 1). Everything in between is shifted
    appropriately. prgv is the array of elements and cbElement is the
    size of each element.
***************************************************************************/
void MoveElement(void *prgv, long cbElement, long ivSrc, long ivTarget)
{
    AssertIn(cbElement, 0, kcbMax);
    AssertIn(ivSrc, 0, kcbMax);
    AssertIn(ivTarget, 0, kcbMax);
    AssertPvCb(prgv, LwMul(cbElement, ivSrc + 1));
    AssertPvCb(prgv, LwMul(cbElement, ivTarget));

    if (ivTarget == ivSrc || ivTarget == ivSrc + 1)
        return;

    // swap the blocks
    if (ivSrc < ivTarget)
    {
        SwapBlocks(PvAddBv(prgv, LwMul(ivSrc, cbElement)), cbElement, LwMul(ivTarget - 1 - ivSrc, cbElement));
    }
    else
    {
        SwapBlocks(PvAddBv(prgv, LwMul(ivTarget, cbElement)), LwMul(ivSrc - ivTarget, cbElement), cbElement);
    }
}

/***************************************************************************
    Check for equality of two blocks.
***************************************************************************/
bool FEqualRgb(const void *pv1, const void *pv2, long cb)
{
    AssertIn(cb, 0, kcbMax);
    AssertPvCb(pv1, cb);
    AssertPvCb(pv2, cb);

    return memcmp(pv1, pv2, cb) == 0;
}

/***************************************************************************
    Compare the two buffers byte for byte and return a the number of bytes
    that match.
***************************************************************************/
long CbEqualRgb(const void *pv1, const void *pv2, long cb)
{
    AssertIn(cb, 0, kcbMax);
    AssertPvCb(pv1, cb);
    AssertPvCb(pv2, cb);

#ifdef IN_80386

    byte *pb;

    __asm {
        // edi -> memory to swap, first pointer
        // esi -> memory to swap, second pointer

		mov		edi,pv1
		mov		esi,pv2

            // compare extra bytes.
		mov		ecx,cb
		and		ecx,3 // (ecx) = length mod 4
		repe	cmpsb // compare odd bytes
		jnz		LMiss // mismatch, go report how far we got

                // compare longs
		mov		ecx,cb // (ecx) = length in bytes
		shr		ecx,2 // (ecx) = length in longs
		repe	cmpsd // compare longs
		jz		LHit // matched all the way

                // esi (and edi) points to the long after the one which caused the
                // mismatch. Back up 1 long and find the byte. Since we know the
                // long didn't match, we can assume one of the bytes won't.
		sub		esi,4 // back up
		sub		edi,4 // back up
		mov		ecx,5 // ensure that ecx doesn't count out
		repe	cmpsb // find mismatch byte

            // esi points to the byte after the one that did not match.
LMiss:
		dec		esi
		dec		edi
		mov		pb,edi
    }

    return pb - (byte *)pv1;

LHit:
    // We matched all the way to the end.
    return cb;

#else //! IN_80386

    const byte *pb1 = (const byte *)pv1;
    const byte *pb2 = (const byte *)pv2;

    // Compare the buffers four bytes at a time
    if (cb >= 4)
    {
        const long *plw1 = (const long *)pv1;
        const long *plw2 = (const long *)pv2;
        long clw = cb >> 2;

        for (; clw-- > 0 && *plw1 == *plw2; plw1++, plw2++)
        {
            // do nothing
        }

        // Start single byte comparison after last dword match
        pb1 = (byte *)plw1;
        pb2 = (byte *)plw2;

        long cbMatch = (pb1 - (byte *)pv1);
        cb = cb - cbMatch;
    }

    // Compare one byte at a time for the remainder
    for (; cb-- > 0 && *pb1 == *pb2; pb1++, pb2++)
    {
        // do nothing
    }
    return pb1 - (byte *)pv1;

#endif //! IN_80386
}

/***************************************************************************
    Compare the two buffers byte for byte and return an fcmp indicating
    their relationship to each other.
***************************************************************************/
ulong FcmpCompareRgb(const void *pv1, const void *pv2, long cb)
{
    AssertIn(cb, 0, kcbMax);
    AssertPvCb(pv1, cb);
    AssertPvCb(pv2, cb);

    long cbMatch = CbEqualRgb(pv1, pv2, cb);

    AssertIn(cbMatch, 0, cb + 1);
    if (cb == cbMatch)
        return fcmpEq;

    return ((byte *)pv1)[cbMatch] < ((byte *)pv2)[cbMatch] ? fcmpLt : fcmpGt;
}

/***************************************************************************
    Copy data without overlap.
****************************************************************************/
void CopyPb(const void *pv1, void *pv2, long cb)
{
    AssertIn(cb, 0, kcbMax);
    AssertPvCb(pv1, cb);
    AssertPvCb(pv2, cb);
    Assert((byte *)pv1 + cb <= (byte *)pv2 || (byte *)pv2 + cb <= (byte *)pv1, "blocks overlap");

    memcpy(pv2, pv1, cb);
}

/***************************************************************************
    Copy data with possible overlap.
***************************************************************************/
void BltPb(const void *pv1, void *pv2, long cb)
{
    AssertIn(cb, 0, kcbMax);
    AssertPvCb(pv1, cb);
    AssertPvCb(pv2, cb);

    memmove(pv2, pv1, cb);
}
