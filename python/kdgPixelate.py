""" Face detection with pixelation
Credits:
https://pypi.org/project/pixelate-redactor/
and
https://github.com/yakupme/Face-Extractor
and
https://docs.opencv.org/3.4.1/d7/d8b/tutorial_py_face_detection.html
"""

import cv2
import sys
import os
import numpy as np
import private as pr

# mysql connector for database
import mysql.connector

# must open connection in raw mode when using binary blobs, like images
mydb = mysql.connector.connect(
  host=pr.host,
  database=pr.db,
  raw=True,
  user=pr.user,
  passwd=pr.pass
)

mycursor = mydb.cursor()
mycursor.execute("SELECT id, privimg FROM uploads where pubimg is null")

myresult = mycursor.fetchall()

print ("Items: ",len(myresult))
for x in myresult:
    id = str(x[0],"utf-8")
    print(id)
    #print("type of image: ",type(x[1]))
    f = open("priv_" + id + ".jpg", "wb")
    f.write(x[1])
    f.close()

    # convert to cv image via np
    src = np.array(x[1])
    image = cv2.imdecode(src, cv2.IMREAD_COLOR)
    # cv2.imwrite( "cvimg.jpg", image );
    # convert to pillow image. need to change color space first
    image2 = cv2.cvtColor(image,cv2.COLOR_BGR2RGB)
    
    # grayscale image for face detection
    image_grey=cv2.cvtColor(image,cv2.COLOR_BGR2GRAY)

    # ##########
    cascade=("haarcascade_frontalface_default.xml",
             "haarcascade_frontalface_alt.xml",
             "haarcascade_frontalface_alt2.xml",
            "haarcascade_eye_tree_eyeglasses.xml",
             "haarcascade_frontalcatface_extended.xml",
             "haarcascade_profileface.xml",
             "haarcascade_smile.xml"
             )
    face_cascade=cv2.CascadeClassifier(cv2.data.haarcascades + cascade[0])

    # pixelation size
    # depends on image size
    imsize = image.shape
    pixel_size = min(imsize[0],imsize[1])//20
    #min pixel size is 12
    pixel_size = max(pixel_size,12)
    #print("Pixel size: ",pixel_size)

    # detect faces via opencv
    faces = face_cascade.detectMultiScale(image_grey,scaleFactor=1.16,minNeighbors=5,minSize=(2*pixel_size,2*pixel_size),flags=0)

    # create fully pixelated image
    lowres = cv2.resize(image, (imsize[1] // pixel_size, imsize[0] // pixel_size),interpolation = cv2.INTER_AREA)
    # expand to original size
    expanded = cv2.resize(lowres, (imsize[1], imsize[0]),interpolation = cv2.INTER_NEAREST)
    #cv2.imshow("p",pxl2);
    #cv2.waitKey(0)

    # pixelate boxes
    for x,y,w,h in faces:
        print ("Face at: ",x,",",y,",",w,",",h)
        image[y:y+h,x: x+w] = expanded[y:y+h,x: x+w]
        
    # create buffer
    res, pxl2 = cv2.imencode(".jpg",image) #, cv2.IMREAD_COLOR)
    #print("Shape pxl2: ",pxl2.shape)
    
    f = open("pxl_" + id + ".jpg", "wb")
    f.write(pxl2)
    f.close()

    # update db
    # binary data like: x'4150'
    p1 = bytearray(pxl2)
    # make sql hex format from bytearray
    p1 = "x" + "\'" + p1.hex() + "\'"
    p2 = id 
    sql = """UPDATE uploads SET pubimg = %s WHERE id = %s""" % (p1,p2)
    # print(sql)
    mycursor.execute(sql)
    # comit: important
    mydb.commit()

    # thumbnail
    if imsize[0] < imsize[1]: # portrait. 0/1 is row/col: reversed to image
        scale = imsize[1] / 128
    else:
        scale = imsize[0] / 128
        
    thumb = cv2.resize(image, None, fx=1/scale, fy=1/scale, interpolation = cv2.INTER_AREA)
    #print("thumb shape: ",thumb.shape)    
    res, thumb2 = cv2.imencode(".jpg",thumb) #, cv2.IMREAD_COLOR)

    f = open("thm_" + id + ".jpg", "wb")
    f.write(thumb2)
    f.close()
   
    # update db again
    # binary data like: x'4150'
    p1 = bytearray(thumb2)
    # make sql hex format from bytearray
    p1 = "x" + "\'" + p1.hex() + "\'"
    p2 = id 
    sql = """UPDATE uploads SET thumb = %s WHERE id = %s""" % (p1,p2)
    # print(sql)
    mycursor.execute(sql)
    # comit: important
    mydb.commit()
    

mycursor.close()
mydb.close()



