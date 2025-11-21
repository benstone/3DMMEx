/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: ShonK
    Project: Kauai
    Reviewed:
    Copyright (c) Microsoft Corporation

    Clipboard object declarations.

***************************************************************************/
#ifndef CLIP_H
#define CLIP_H

/***************************************************************************
    Clipboard object.
***************************************************************************/
typedef class CLIP *PCLIP;
#define CLIP_PAR BASE
#define kclsCLIP KLCONST4('C', 'L', 'I', 'P')
class CLIP : public CLIP_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM

  protected:
    PDOCB _pdocb;

    bool _fDocCurrent : 1;
    bool _fExporting : 1;
    bool _fImporting : 1;
    bool _fDelayImport : 1;

#ifdef WIN
    HN _hnExport;
#endif
    int32_t _clfmExport;
    int32_t _clfmImport;

    void _EnsureDoc();
    void _ExportCur(void);
    void _ImportCur(void);
    bool _FImportFormat(int32_t clfm, void *pv = pvNil, int32_t cb = 0, PDOCB *ppdocb = pvNil, bool *pfDelay = pvNil);

  public:
    CLIP(void);

    bool FDocIsClip(PDOCB pdocb);
    void Show(void);

    void Set(PDOCB pdocb = pvNil, bool fExport = fTrue);
    bool FGetFormat(int32_t cls, PDOCB *pdocb = pvNil);

    bool FInitExport(void);
    void *PvExport(int32_t cb, int32_t clfm);
    void EndExport(void);

    void Import(void);
};

extern PCLIP vpclip;

const int32_t clfmNil = 0;
// REVIEW shonk: Mac unicode
#ifdef MAC
const int32_t kclfmUniText = KLCONST4('W', 'T', 'X', 'T');
const int32_t kclfmSbText = KLCONST4('T', 'E', 'X', 'T');
#else

#ifndef CF_UNICODETEXT
#define CF_UNICODETEXT 13
#endif

#ifndef CF_TEXT
#define CF_TEXT 1
#endif

const int32_t kclfmUniText = CF_UNICODETEXT;
const int32_t kclfmSbText = CF_TEXT;
#endif

#ifdef UNICODE
const int32_t kclfmText = kclfmUniText;
#else  //! UNICODE
const int32_t kclfmText = kclfmSbText;
#endif //! UNICODE

#endif //! CLIP_H
