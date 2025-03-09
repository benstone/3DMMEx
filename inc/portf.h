/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************

    Portfolio interface.

    Primary Author: ******
    Review Status: Not yet reviewed

***************************************************************************/

/***************************************************************************

 FPortDisplayWithIds: Display the portfolio to open or save a file. Portfolio
                    title and filters generated using supplied string ids.

 Arguments: fni                 - Output FNI for file selected
            fOpen               - fTrue if open portfolio, else save portfolio.
            lFilterLabel        - id of portfolio filter label
            lFilterExt          - id of portfolio filter extension
            lTitle              - id of portfolio title
            lpstrDefExt         - Ptr to string for default file extension for save if required.
            pstnDefFileName     - Ptr to default extension stn if required.
            pfniInitialDir      - Ptr to initial directory fni if required.
            grfPrevType         - Bits for types of preview required, (eg movie, sound etc) == 0 if no preview
            cnoWave             - Wave cno for audio when portfolio is invoked

 Returns:   TRUE- File selected
            FALSE- User canceled portfolio.

***************************************************************************/
bool FPortDisplayWithIds(FNI *pfni, bool fOpen, int32_t lFilterLabel, int32_t lFilterExt, int32_t lTitle,
                         PCSZ lpstrDefExt, PSTN pstnDefFileName, FNI *pfniInitialDir, uint32_t grfPrevType,
                         CNO cnoWave);
enum
{
    fpfNil = 0x0000,
    fpfPortPrevMovie = 0x0001,
    fpfPortPrevSound = 0x0002,
    fpfPortPrevTexture = 0x0004
};
