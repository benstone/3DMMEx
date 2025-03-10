/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************

    Portfolio related includes.

    Primary Author: ******
    Review Status: Not yet reviewed

***************************************************************************/

// Top level portoflio routines.
bool FPortGetFniMovieOpen(FNI *pfni);
bool FPortDisplayWithIds(FNI *pfni, bool fOpen, int32_t lFilterLabel, int32_t lFilterExt, int32_t lTitle,
                         LPCTSTR lpstrDefExt, PSTN pstnDefFileName, FNI *pfniInitialDir, uint32_t grfPrevType,
                         CNO cnoWave);
bool FPortGetFniOpen(FNI *pfni, LPCTSTR lpstrFilter, LPCTSTR lpstrTitle, FNI *pfniInitialDir, uint32_t grfPrevType,
                     CNO cnoWave);
bool FPortGetFniSave(FNI *pfni, LPCTSTR lpstrFilter, LPCTSTR lpstrTitle, LPCTSTR lpstrDefExt, PSTN pstnDefFileName,
                     uint32_t grfPrevType, CNO cnoWave);

UINT_PTR CALLBACK OpenHookProc(HWND hWnd, UINT msg, WPARAM wParam, LPARAM lParam);
void OpenPreview(HWND hwnd, PGNV pgnvOff, RCS *prcsPreview);
void RepaintPortfolio(HWND hwndCustom);

static WNDPROC lpBtnProc;
LRESULT CALLBACK SubClassBtnProc(HWND hWnd, UINT msg, WPARAM wParam, LPARAM lParam);
static WNDPROC lpPreviewProc;
LRESULT CALLBACK SubClassPreviewProc(HWND hWnd, UINT msg, WPARAM wParam, LPARAM lParam);
static WNDPROC lpDlgProc;
LRESULT CALLBACK SubClassDlgProc(HWND hWnd, UINT msg, WPARAM wParam, LPARAM lParam);

typedef struct dlginfo
{
    bool fIsOpen;         // fTrue if Open file, (ie not Save file)
    bool fDrawnBkgnd;     // fTrue if portfolio background bitmap has been displayed.
    RCS rcsDlg;           // Initial size of the portfolio common dlg window client area.
    uint32_t grfPrevType; // Bits for types of preview required, (eg movie, sound etc) == 0 if no preview
    CNO cnoWave;          // Wave file cno for audio when portfolio is invoked.
} DLGINFO;
typedef DLGINFO *PDLGINFO;

enum
{
    fpfNil = 0x0000,
    fpfPortPrevMovie = 0x0001,
    fpfPortPrevSound = 0x0002,
    fpfPortPrevTexture = 0x0004
};
