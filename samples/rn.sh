num_vars=$#
if [ $num_vars -lt 2 ]
then
    p=`basename $0`
    echo "usage: $p <directory> <extension>"
    exit
fi
path=$1
ext=$2
for i in ${path}/*.${ext}; do
  filename=`echo $i | sed s/${ext}//`
  sox ${filename}${ext} ${filename}mp3
done
