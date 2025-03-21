;
;	Author: ShonK
;	Project: Kauai
;	Reviewed:
;	Copyright (c) Microsoft Corporation
;
;	Asm code for the MC_68020 build.
;


	code

;	int32_t LwMulDiv(int32_t lw, int32_t lwMul, int32_t lwDiv)
;
;	Multiply lw by lwMul and divide by lwDiv without losing precision.
;	Assumes a 68020 or better.
cProc LwMulDiv,PUBLIC,,0
;	parmD	lw
;	parmD	lwMul
;	parmD	lwDiv
cBegin nogen
	move.l	4(a7),d0	;lw
	;following hex is: muls.l	8(A7),d1:d0
	dc.w	0x4C2F
	dc.w	0x0C01
	dc.w	0x0008
	;following hex is: divs.l	0x0C(A7),d1:d0
	dc.w	0x4C6F
	dc.w	0x0C01
	dc.w	0x000C
	rts
cEnd nogen


;	void MulLw(int32_t lw1, int32_t lw2, int32_t *plwHigh, uint32_t *pluLow)
;
;	Multiplies 2 longs to get a 64 bit (signed) value.  Assumes a 68020
;	or better.
cProc MulLw,PUBLIC,,0
;	parmD	lw1
;	parmD	lw2
;	parmD	plwHigh
;	parmD	pluLow
cBegin nogen
	move.l	4(a7),d0	;lw1
	;following hex is: muls.l	8(A7),d1:d0
	dc.w	0x4C2F
	dc.w	0x0C01
	dc.w	0x0008
	move.l	0x0C(a7),a0	;plwHigh
	move.l	d1,(a0)
	move.l	0x10(a7),a0	;pluLow
	move.l	d0,(a0)
	rts
cEnd nogen


;	uint32_t LuMulDiv(uint32_t lu, uint32_t luMul, uint32_t luDiv)
;
;	Multiply lu by luMul and divide by luDiv without losing precision.
;	Assumes a 68020 or better.
cProc LuMulDiv,PUBLIC,,0
;	parmD	lu
;	parmD	luMul
;	parmD	luDiv
cBegin nogen
	move.l	4(a7),d0	;lw
	;following hex is: mulu.l	8(A7),d1:d0
	dc.w	0x4C2F
	dc.w	0x0401
	dc.w	0x0008
	;following hex is: divu.l	0x0C(A7),d1:d0
	dc.w	0x4C6F
	dc.w	0x0401
	dc.w	0x000C
	rts
cEnd nogen


;	void MulLu(int32_t lu1, int32_t lu2, uint32_t *pluHigh, uint32_t *pluLow)
;
;	Multiplies 2 unsigned longs to get a 64 bit (unsigned) value.  Assumes a
;	68020 or better.
cProc MulLu,PUBLIC,,0
;	parmD	lu1
;	parmD	lu2
;	parmD	pluHigh
;	parmD	pluLow
cBegin nogen
	move.l	4(a7),d0	;lu1
	;following hex is: mulu.l	8(A7),d1:d0
	dc.w	0x4C2F
	dc.w	0x0401
	dc.w	0x0008
	move.l	0x0C(a7),a0	;pluHigh
	move.l	d1,(a0)
	move.l	0x10(a7),a0	;pluLow
	move.l	d0,(a0)
	rts
cEnd nogen


