""" Export all images from the database """

import cv2
import sys
import os
import private as pr

# we also need PIL for the pixelation
from PIL import Image
import numpy as np
from io import StringIO

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
mycursor.execute("SELECT id, pubimg, thumb, privimg FROM uploads where pubimg is null")

myresult = mycursor.fetchall()

mycursor.close()
mydb.close()

print ("Items: ",len(myresult))
for x in myresult:
    id = str(x[0],"utf-8")
    print(id)
    print(type(x[1]),type(x[2]),type(x[3]))
    #print("type of image: ",type(x[1]))
    f = open("pub_" + id + ".jpg", "wb")
    if x[1] is not None:
        f.write(x[1])
    f.close()
    f = open("priv_" + id + ".jpg", "wb")
    if x[3] is not None:
        f.write(x[3])
    f.close()
    f = open("thmb_" + id + ".jpg", "wb")
    if x[2] is not None:
        f.write(x[2])
    f.close()

    

